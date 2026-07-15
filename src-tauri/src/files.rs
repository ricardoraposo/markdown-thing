use std::{
    collections::{HashSet, VecDeque},
    env,
    path::{Path, PathBuf},
    sync::Mutex,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;

const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024;
const READY_ARGUMENT_PREFIX: &str = "--markdown-thing-ready=";
const READY_ENV: &str = "MARKDOWN_THING_READY_FILE";

#[derive(Default)]
pub struct FileAuthorization {
    paths: Mutex<HashSet<PathBuf>>,
}

impl FileAuthorization {
    fn authorize(&self, path: PathBuf) -> Result<(), String> {
        self.paths
            .lock()
            .map_err(|_| "File authorization state is unavailable".to_owned())?
            .insert(path);
        Ok(())
    }

    fn require(&self, path: &Path) -> Result<PathBuf, String> {
        let canonical = path
            .canonicalize()
            .map_err(|error| format!("Could not resolve file path: {error}"))?;
        let authorized = self
            .paths
            .lock()
            .map_err(|_| "File authorization state is unavailable".to_owned())?;
        if !authorized.contains(&canonical) {
            return Err("File access was not authorized by a command-line launch".to_owned());
        }
        Ok(canonical)
    }
}

pub struct StartupFile {
    path: Result<Option<PathBuf>, String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum LaunchItem {
    Document(OpenedDocument),
    Error(String),
}

#[derive(Default)]
pub struct LaunchQueue {
    items: Mutex<VecDeque<LaunchItem>>,
}

impl LaunchQueue {
    pub fn push(&self, item: LaunchItem) -> Result<(), String> {
        self.items
            .lock()
            .map_err(|_| "Launch queue is unavailable".to_owned())?
            .push_back(item);
        Ok(())
    }

    fn drain(&self) -> Result<Vec<LaunchItem>, String> {
        let mut items = self
            .items
            .lock()
            .map_err(|_| "Launch queue is unavailable".to_owned())?;
        Ok(items.drain(..).collect())
    }
}

pub fn startup_file_from_env() -> StartupFile {
    let argument = env::args_os()
        .skip(1)
        .find(|argument| {
            !argument
                .to_string_lossy()
                .starts_with(READY_ARGUMENT_PREFIX)
        })
        .map(PathBuf::from);
    let path = env::current_dir()
        .map_err(|error| format!("Could not determine the working directory: {error}"))
        .and_then(|cwd| resolve_startup_argument(argument, &cwd));
    StartupFile { path }
}

pub fn signal_ready_from_env() {
    if let Some(path) = env::var_os(READY_ENV) {
        let _ = std::fs::write(path, []);
    }
}

pub fn signal_ready_from_arguments(arguments: &[String]) {
    if let Some(path) = arguments
        .iter()
        .find_map(|argument| argument.strip_prefix(READY_ARGUMENT_PREFIX))
    {
        let _ = std::fs::write(path, []);
    }
}

fn resolve_startup_argument(
    argument: Option<PathBuf>,
    working_directory: &Path,
) -> Result<Option<PathBuf>, String> {
    let Some(argument) = argument else {
        return Ok(None);
    };
    let candidate = if argument.is_absolute() {
        argument
    } else {
        working_directory.join(argument)
    };
    let path = candidate
        .canonicalize()
        .map_err(|error| format!("Could not open {}: {error}", candidate.display()))?;
    if !path.is_file() {
        return Err(format!("{} is not a file", path.display()));
    }
    Ok(Some(path))
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedDocument {
    path: String,
    content: String,
}

#[derive(Debug, Serialize)]
pub struct SavedDocument {
    path: String,
}

fn display_path(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| "The selected path is not valid UTF-8".to_owned())
}

async fn read_utf8(path: &Path) -> Result<String, String> {
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|error| format!("Could not read file: {error}"))?;
    String::from_utf8(bytes).map_err(|_| "The selected file is not valid UTF-8".to_owned())
}

async fn write_utf8(path: &Path, content: &str) -> Result<(), String> {
    tokio::fs::write(path, content)
        .await
        .map_err(|error| format!("Could not save file: {error}"))
}

pub fn launched_document(
    authorization: &FileAuthorization,
    arguments: &[String],
    working_directory: &Path,
) -> Result<Option<OpenedDocument>, String> {
    let argument = arguments
        .iter()
        .skip(1)
        .find(|argument| !argument.starts_with(READY_ARGUMENT_PREFIX))
        .map(PathBuf::from);
    let Some(path) = resolve_startup_argument(argument, working_directory)? else {
        return Ok(None);
    };
    let bytes = std::fs::read(&path).map_err(|error| format!("Could not read file: {error}"))?;
    let content =
        String::from_utf8(bytes).map_err(|_| "The selected file is not valid UTF-8".to_owned())?;
    authorization.authorize(path.clone())?;
    Ok(Some(OpenedDocument {
        path: display_path(&path)?,
        content,
    }))
}

async fn open_document(
    authorization: &FileAuthorization,
    path: &Path,
) -> Result<OpenedDocument, String> {
    let path = path
        .canonicalize()
        .map_err(|error| format!("Could not resolve selected file: {error}"))?;
    let content = read_utf8(&path).await?;
    authorization.authorize(path.clone())?;
    Ok(OpenedDocument {
        path: display_path(&path)?,
        content,
    })
}

#[tauri::command]
pub fn drain_launch_queue(
    launch_queue: tauri::State<'_, LaunchQueue>,
) -> Result<Vec<LaunchItem>, String> {
    launch_queue.drain()
}

#[tauri::command]
pub async fn initial_document(
    authorization: tauri::State<'_, FileAuthorization>,
    startup_file: tauri::State<'_, StartupFile>,
) -> Result<Option<OpenedDocument>, String> {
    let Some(path) = startup_file.path.as_ref().map_err(Clone::clone)? else {
        return Ok(None);
    };
    open_document(&authorization, path).await.map(Some)
}

async fn authorized_save(
    authorization: &FileAuthorization,
    path: &Path,
    content: &str,
) -> Result<PathBuf, String> {
    let authorized_path = authorization.require(path)?;
    write_utf8(&authorized_path, content).await?;
    Ok(authorized_path)
}

#[tauri::command]
pub async fn save_markdown(
    authorization: tauri::State<'_, FileAuthorization>,
    path: String,
    content: String,
) -> Result<SavedDocument, String> {
    let path = authorized_save(&authorization, Path::new(&path), &content).await?;
    Ok(SavedDocument {
        path: display_path(&path)?,
    })
}

fn resolve_local_image(document_path: &Path, target: &str) -> Result<PathBuf, String> {
    if target.is_empty() || target.contains('\0') {
        return Err("Invalid image path".to_owned());
    }
    let relative = Path::new(target);
    if relative.is_absolute() || target.contains("://") {
        return Err("Only relative local image paths are allowed".to_owned());
    }
    let root = document_path
        .parent()
        .ok_or_else(|| "The document has no parent folder".to_owned())?
        .canonicalize()
        .map_err(|error| format!("Could not resolve document folder: {error}"))?;
    let image = root
        .join(relative)
        .canonicalize()
        .map_err(|error| format!("Could not resolve image: {error}"))?;
    if !image.starts_with(&root) {
        return Err("Image path must stay inside the document folder".to_owned());
    }
    Ok(image)
}

fn detected_image_mime(bytes: &[u8]) -> Result<&'static str, String> {
    let detected = infer::get(bytes)
        .ok_or_else(|| "The referenced file is not a supported image".to_owned())?;
    match detected.mime_type() {
        "image/png" => Ok("image/png"),
        "image/jpeg" => Ok("image/jpeg"),
        "image/gif" => Ok("image/gif"),
        "image/webp" => Ok("image/webp"),
        _ => Err("The referenced file is not a supported image".to_owned()),
    }
}

async fn image_data_url(document_path: &Path, target: &str) -> Result<String, String> {
    let image = resolve_local_image(document_path, target)?;
    let metadata = tokio::fs::metadata(&image)
        .await
        .map_err(|error| format!("Could not inspect image: {error}"))?;
    if metadata.len() > MAX_IMAGE_BYTES {
        return Err("Image exceeds the 10 MiB limit".to_owned());
    }
    let bytes = tokio::fs::read(&image)
        .await
        .map_err(|error| format!("Could not read image: {error}"))?;
    let mime = detected_image_mime(&bytes)?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

async fn authorized_image_data_url(
    authorization: &FileAuthorization,
    document_path: &Path,
    target: &str,
) -> Result<String, String> {
    let authorized_document = authorization.require(document_path)?;
    image_data_url(&authorized_document, target).await
}

#[tauri::command]
pub async fn load_local_image(
    authorization: tauri::State<'_, FileAuthorization>,
    document_path: String,
    target: String,
) -> Result<String, String> {
    authorized_image_data_url(&authorization, Path::new(&document_path), &target).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn png_fixture() -> Vec<u8> {
        STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
            .unwrap()
    }

    fn fixture_dir() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("markdown-thing-{unique}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn resolves_relative_startup_file_from_working_directory() {
        let dir = fixture_dir();
        let file = dir.join("TODO.md");
        fs::write(&file, "# Todo").unwrap();

        let resolved = resolve_startup_argument(Some(PathBuf::from("TODO.md")), &dir).unwrap();

        assert_eq!(resolved, Some(file.canonicalize().unwrap()));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn resolves_and_authorizes_a_later_launch_file() {
        let dir = fixture_dir();
        let file = dir.join("second.md");
        fs::write(&file, "# Second").unwrap();
        let authorization = FileAuthorization::default();
        let arguments = vec!["markdown-thing".to_owned(), "second.md".to_owned()];

        let opened = launched_document(&authorization, &arguments, &dir)
            .unwrap()
            .unwrap();

        assert_eq!(opened.content, "# Second");
        assert!(authorization.require(&file).is_ok());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn launch_queue_retains_items_until_the_frontend_drains_it() {
        let queue = LaunchQueue::default();
        queue.push(LaunchItem::Error("first".to_owned())).unwrap();
        queue.push(LaunchItem::Error("second".to_owned())).unwrap();

        let drained = queue.drain().unwrap();

        assert_eq!(drained.len(), 2);
        assert!(queue.drain().unwrap().is_empty());
    }

    #[test]
    fn readiness_argument_is_not_treated_as_a_document() {
        let authorization = FileAuthorization::default();
        let arguments = vec![
            "markdown-thing".to_owned(),
            "--markdown-thing-ready=/tmp/ready".to_owned(),
        ];
        assert!(
            launched_document(&authorization, &arguments, Path::new("/"))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn rejects_a_startup_directory() {
        let dir = fixture_dir();
        let error = resolve_startup_argument(Some(dir.clone()), Path::new("/")).unwrap_err();
        assert!(error.contains("is not a file"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn local_images_cannot_escape_document_folder() {
        let dir = fixture_dir();
        let outside = dir.parent().unwrap().join("outside.png");
        fs::write(&outside, b"png").unwrap();
        let document = dir.join("note.md");
        let result = resolve_local_image(&document, "../outside.png");
        assert!(result.is_err());
        let _ = fs::remove_file(outside);
        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn rejects_spoofed_image_extensions() {
        let dir = fixture_dir();
        let document = dir.join("note.md");
        fs::write(&document, "note").unwrap();
        fs::write(dir.join("spoofed.png"), "not an image").unwrap();
        let error = image_data_url(&document, "spoofed.png").await.unwrap_err();
        assert!(error.contains("not a supported image"));
        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn detects_valid_image_content_independently_of_extension() {
        let dir = fixture_dir();
        let document = dir.join("note.md");
        fs::write(&document, "note").unwrap();
        fs::write(dir.join("pixel.bin"), png_fixture()).unwrap();
        let value = image_data_url(&document, "pixel.bin").await.unwrap();
        assert!(value.starts_with("data:image/png;base64,"));
        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn rejects_oversized_images_before_reading_them() {
        let dir = fixture_dir();
        let document = dir.join("note.md");
        fs::write(&document, "note").unwrap();
        let file = fs::File::create(dir.join("large.png")).unwrap();
        file.set_len(MAX_IMAGE_BYTES + 1).unwrap();
        let error = image_data_url(&document, "large.png").await.unwrap_err();
        assert!(error.contains("10 MiB"));
        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn reports_non_utf8_documents() {
        let dir = fixture_dir();
        let path = dir.join("invalid.md");
        fs::write(&path, [0xff, 0xfe]).unwrap();
        let error = read_utf8(&path).await.unwrap_err();
        assert!(error.contains("not valid UTF-8"));
        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn save_requires_a_command_line_authorized_path() {
        let dir = fixture_dir();
        let path = dir.join("note.md");
        fs::write(&path, "original").unwrap();
        let authorization = FileAuthorization::default();

        let error = authorized_save(&authorization, &path, "changed")
            .await
            .unwrap_err();
        assert!(error.contains("not authorized"));
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");

        authorization
            .authorize(path.canonicalize().unwrap())
            .unwrap();
        authorized_save(&authorization, &path, "changed")
            .await
            .unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "changed");
        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn local_images_require_an_authorized_document() {
        let dir = fixture_dir();
        let document = dir.join("note.md");
        fs::write(&document, "note").unwrap();
        fs::write(dir.join("pixel.png"), png_fixture()).unwrap();
        let authorization = FileAuthorization::default();

        let error = authorized_image_data_url(&authorization, &document, "pixel.png")
            .await
            .unwrap_err();
        assert!(error.contains("not authorized"));

        authorization
            .authorize(document.canonicalize().unwrap())
            .unwrap();
        let value = authorized_image_data_url(&authorization, &document, "pixel.png")
            .await
            .unwrap();
        assert!(value.starts_with("data:image/png;base64,"));
        let _ = fs::remove_dir_all(dir);
    }
}
