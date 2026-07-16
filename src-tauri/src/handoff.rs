use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EphemeralDocument {
    pub id: String,
    pub title: String,
    pub content: String,
}

#[cfg(unix)]
mod unix {
    use super::EphemeralDocument;
    use crate::files::{LaunchItem, LaunchQueue};
    use std::{
        env, fs,
        io::{Read, Write},
        os::unix::{
            fs::{FileTypeExt, MetadataExt, PermissionsExt},
            net::{UnixListener, UnixStream},
        },
        path::{Path, PathBuf},
        sync::atomic::{AtomicU64, Ordering},
        thread,
        time::Duration,
    };
    use tauri::{AppHandle, Emitter, Manager};

    const PROTOCOL_MAGIC: &[u8] = b"MARKDOWN_THING_SHOW_V1\0";
    const MAX_MARKDOWN_BYTES: u64 = 10 * 1024 * 1024;
    const MAX_TITLE_BYTES: usize = 256;
    static NEXT_DOCUMENT_ID: AtomicU64 = AtomicU64::new(1);

    pub struct HandoffSocket {
        path: PathBuf,
    }

    impl Drop for HandoffSocket {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.path);
        }
    }

    fn current_uid() -> u32 {
        unsafe { libc::geteuid() }
    }

    fn validate_private_directory(path: &Path) -> Result<(), String> {
        let metadata = fs::symlink_metadata(path)
            .map_err(|error| format!("Could not inspect IPC directory: {error}"))?;
        if !metadata.file_type().is_dir() || metadata.uid() != current_uid() {
            return Err(
                "IPC directory is not a private directory owned by the current user".to_owned(),
            );
        }
        if metadata.mode() & 0o077 != 0 {
            return Err("IPC directory permissions are too broad".to_owned());
        }
        Ok(())
    }

    fn socket_directory() -> Result<PathBuf, String> {
        let base = env::var_os("XDG_RUNTIME_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| env::temp_dir().join(format!("markdown-thing-{}", current_uid())));
        if env::var_os("XDG_RUNTIME_DIR").is_some() {
            let metadata = fs::symlink_metadata(&base)
                .map_err(|error| format!("Could not inspect XDG runtime directory: {error}"))?;
            if !metadata.file_type().is_dir() || metadata.uid() != current_uid() {
                return Err("XDG runtime directory is not owned by the current user".to_owned());
            }
        }

        let directory = base.join("markdown-thing");
        match fs::create_dir(&directory) {
            Ok(()) => fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
                .map_err(|error| format!("Could not secure IPC directory: {error}"))?,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(format!("Could not create IPC directory: {error}")),
        }
        validate_private_directory(&directory)?;
        Ok(directory)
    }

    fn socket_path() -> Result<PathBuf, String> {
        Ok(socket_directory()?.join("show.sock"))
    }

    fn remove_stale_socket(path: &Path) -> Result<(), String> {
        match fs::symlink_metadata(path) {
            Ok(metadata) => {
                if !metadata.file_type().is_socket() || metadata.uid() != current_uid() {
                    return Err("Refusing to replace an invalid IPC socket".to_owned());
                }
                fs::remove_file(path)
                    .map_err(|error| format!("Could not replace stale IPC socket: {error}"))
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("Could not inspect IPC socket: {error}")),
        }
    }

    fn read_sized_utf8(
        stream: &mut UnixStream,
        length: usize,
        maximum: usize,
        description: &str,
    ) -> Result<String, String> {
        if length == 0 && description == "title" {
            return Err("The document title cannot be empty".to_owned());
        }
        if length > maximum {
            return Err(format!("The {description} exceeds the size limit"));
        }
        let mut bytes = vec![0; length];
        stream
            .read_exact(&mut bytes)
            .map_err(|error| format!("Could not read {description}: {error}"))?;
        String::from_utf8(bytes).map_err(|_| format!("The {description} must be valid UTF-8"))
    }

    fn receive_document(stream: &mut UnixStream) -> Result<EphemeralDocument, String> {
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .map_err(|error| format!("Could not configure IPC connection: {error}"))?;
        let mut magic = vec![0; PROTOCOL_MAGIC.len()];
        stream
            .read_exact(&mut magic)
            .map_err(|error| format!("Could not read IPC header: {error}"))?;
        if magic != PROTOCOL_MAGIC {
            return Err("Invalid Markdown Thing IPC protocol".to_owned());
        }

        let mut title_length = [0; 4];
        let mut content_length = [0; 8];
        stream
            .read_exact(&mut title_length)
            .and_then(|()| stream.read_exact(&mut content_length))
            .map_err(|error| format!("Could not read IPC lengths: {error}"))?;
        let title_length = u32::from_be_bytes(title_length) as usize;
        let content_length_u64 = u64::from_be_bytes(content_length);
        let content_length = usize::try_from(content_length_u64)
            .map_err(|_| "The Markdown exceeds the size limit".to_owned())?;
        let title = read_sized_utf8(stream, title_length, MAX_TITLE_BYTES, "title")?;
        if title.trim().is_empty() || title.chars().any(char::is_control) {
            return Err("The document title is invalid".to_owned());
        }
        let content = read_sized_utf8(
            stream,
            content_length,
            MAX_MARKDOWN_BYTES as usize,
            "Markdown",
        )?;
        let id = format!(
            "agent-{}-{}",
            std::process::id(),
            NEXT_DOCUMENT_ID.fetch_add(1, Ordering::Relaxed)
        );
        Ok(EphemeralDocument { id, title, content })
    }

    fn write_response(stream: &mut UnixStream, result: Result<(), String>) {
        let (status, message) = match result {
            Ok(()) => (0_u8, String::new()),
            Err(error) => (1_u8, error),
        };
        let bytes = message.as_bytes();
        let length = u32::try_from(bytes.len()).unwrap_or(u32::MAX);
        let _ = stream
            .write_all(&[status])
            .and_then(|()| stream.write_all(&length.to_be_bytes()))
            .and_then(|()| stream.write_all(&bytes[..bytes.len().min(length as usize)]));
    }

    fn handle_connection(app: &AppHandle, stream: &mut UnixStream) -> Result<(), String> {
        let document = receive_document(stream)?;
        app.state::<LaunchQueue>()
            .push(LaunchItem::Ephemeral(document))?;
        app.emit("launch-queued", ())
            .map_err(|error| format!("Could not notify the editor: {error}"))?;
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
        Ok(())
    }

    pub fn start_listener(app: AppHandle) -> Result<HandoffSocket, String> {
        let path = socket_path()?;
        remove_stale_socket(&path)?;
        let listener = UnixListener::bind(&path)
            .map_err(|error| format!("Could not bind IPC socket: {error}"))?;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("Could not secure IPC socket: {error}"))?;

        thread::Builder::new()
            .name("markdown-thing-handoff".to_owned())
            .spawn(move || {
                for connection in listener.incoming() {
                    let Ok(mut stream) = connection else { continue };
                    let result = handle_connection(&app, &mut stream);
                    write_response(&mut stream, result);
                }
            })
            .map_err(|error| format!("Could not start IPC listener: {error}"))?;
        Ok(HandoffSocket { path })
    }

    pub fn send_document(title: &str, content: &str) -> Result<(), String> {
        if title.is_empty() || title.len() > MAX_TITLE_BYTES || title.chars().any(char::is_control)
        {
            return Err("The document title is invalid".to_owned());
        }
        if content.len() as u64 > MAX_MARKDOWN_BYTES {
            return Err(format!(
                "Markdown input exceeds the {} MiB limit",
                MAX_MARKDOWN_BYTES / 1024 / 1024
            ));
        }

        let path = socket_path()?;
        let mut stream = UnixStream::connect(&path)
            .map_err(|error| format!("Could not connect to Markdown Thing: {error}"))?;
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .and_then(|()| stream.set_write_timeout(Some(Duration::from_secs(5))))
            .map_err(|error| format!("Could not configure IPC connection: {error}"))?;
        let title_length =
            u32::try_from(title.len()).map_err(|_| "The document title is too long".to_owned())?;
        let content_length =
            u64::try_from(content.len()).map_err(|_| "The Markdown is too long".to_owned())?;
        stream
            .write_all(PROTOCOL_MAGIC)
            .and_then(|()| stream.write_all(&title_length.to_be_bytes()))
            .and_then(|()| stream.write_all(&content_length.to_be_bytes()))
            .and_then(|()| stream.write_all(title.as_bytes()))
            .and_then(|()| stream.write_all(content.as_bytes()))
            .map_err(|error| format!("Could not send Markdown: {error}"))?;

        let mut status = [0; 1];
        let mut message_length = [0; 4];
        stream
            .read_exact(&mut status)
            .and_then(|()| stream.read_exact(&mut message_length))
            .map_err(|error| format!("Could not read Markdown Thing response: {error}"))?;
        let message_length = u32::from_be_bytes(message_length) as usize;
        if message_length > 4096 {
            return Err("Markdown Thing returned an invalid response".to_owned());
        }
        let mut message = vec![0; message_length];
        stream
            .read_exact(&mut message)
            .map_err(|error| format!("Could not read Markdown Thing response: {error}"))?;
        if status[0] == 0 {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&message).into_owned())
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::os::unix::net::UnixStream;

        #[test]
        fn protocol_round_trips_markdown() {
            let (mut sender, mut receiver) = UnixStream::pair().unwrap();
            let sending = thread::spawn(move || {
                sender.write_all(PROTOCOL_MAGIC).unwrap();
                sender.write_all(&6_u32.to_be_bytes()).unwrap();
                sender.write_all(&8_u64.to_be_bytes()).unwrap();
                sender.write_all(b"Review").unwrap();
                sender.write_all(b"# Report").unwrap();
            });
            let document = receive_document(&mut receiver).unwrap();
            sending.join().unwrap();
            assert_eq!(document.title, "Review");
            assert_eq!(document.content, "# Report");
        }

        #[test]
        fn protocol_rejects_oversized_content_before_allocating() {
            let (mut sender, mut receiver) = UnixStream::pair().unwrap();
            sender.write_all(PROTOCOL_MAGIC).unwrap();
            sender.write_all(&1_u32.to_be_bytes()).unwrap();
            sender
                .write_all(&(MAX_MARKDOWN_BYTES + 1).to_be_bytes())
                .unwrap();
            sender.write_all(b"x").unwrap();
            assert!(receive_document(&mut receiver)
                .unwrap_err()
                .contains("size limit"));
        }
    }
}

#[cfg(unix)]
pub use unix::{send_document, start_listener, HandoffSocket};

#[cfg(not(unix))]
pub struct HandoffSocket;

#[cfg(not(unix))]
pub fn start_listener(_app: tauri::AppHandle) -> Result<HandoffSocket, String> {
    Err("Agent Markdown handoff is currently supported on Linux only".to_owned())
}

#[cfg(not(unix))]
pub fn send_document(_title: &str, _content: &str) -> Result<(), String> {
    Err("Agent Markdown handoff is currently supported on Linux only".to_owned())
}
