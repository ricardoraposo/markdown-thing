#[cfg(any(test, all(unix, not(debug_assertions))))]
const READY_ARGUMENT_PREFIX: &str = "--markdown-thing-ready=";
#[cfg(any(test, all(unix, not(debug_assertions))))]
const MAX_SHOW_BYTES: u64 = 10 * 1024 * 1024;
#[cfg(any(test, all(unix, not(debug_assertions))))]
const MAX_TITLE_BYTES: usize = 256;

#[cfg(any(test, all(unix, not(debug_assertions))))]
#[derive(Debug, PartialEq, Eq)]
enum HandoffCommand {
    Show(String),
    Stream(String),
}

#[cfg(any(test, all(unix, not(debug_assertions))))]
fn is_reserved_argument(argument: &std::ffi::OsStr) -> bool {
    argument
        .to_string_lossy()
        .starts_with(READY_ARGUMENT_PREFIX)
}

#[cfg(any(test, all(unix, not(debug_assertions))))]
fn handoff_command(arguments: &[std::ffi::OsString]) -> Result<Option<HandoffCommand>, String> {
    let Some(command) = arguments.first().and_then(|argument| argument.to_str()) else {
        return Ok(None);
    };
    if command != "show" && command != "stream" {
        return Ok(None);
    }

    let mut title = "Agent response".to_owned();
    let mut index = 1;
    while index < arguments.len() {
        let argument = arguments[index].to_string_lossy();
        if argument == "--title" {
            index += 1;
            let value = arguments
                .get(index)
                .ok_or_else(|| "--title requires a value".to_owned())?;
            title = value.to_string_lossy().into_owned();
        } else if let Some(value) = argument.strip_prefix("--title=") {
            title = value.to_owned();
        } else {
            return Err(format!("Unknown {command} option: {argument}"));
        }
        index += 1;
    }

    let title = title.trim().to_owned();
    if title.is_empty() {
        return Err("The document title cannot be empty".to_owned());
    }
    if title.len() > MAX_TITLE_BYTES {
        return Err(format!(
            "The document title cannot exceed {MAX_TITLE_BYTES} UTF-8 bytes"
        ));
    }
    if title.chars().any(char::is_control) {
        return Err("The document title cannot contain control characters".to_owned());
    }
    Ok(Some(if command == "show" {
        HandoffCommand::Show(title)
    } else {
        HandoffCommand::Stream(title)
    }))
}

#[cfg(any(test, all(unix, not(debug_assertions))))]
fn read_show_input(reader: impl std::io::Read) -> Result<String, String> {
    use std::io::Read;

    let mut content = Vec::new();
    reader
        .take(MAX_SHOW_BYTES + 1)
        .read_to_end(&mut content)
        .map_err(|error| format!("Could not read Markdown from stdin: {error}"))?;
    if content.len() as u64 > MAX_SHOW_BYTES {
        return Err(format!(
            "Markdown input exceeds the {} MiB limit",
            MAX_SHOW_BYTES / 1024 / 1024
        ));
    }
    String::from_utf8(content).map_err(|_| "Markdown input must be valid UTF-8".to_owned())
}

#[cfg(all(unix, not(debug_assertions)))]
fn launch_detached(forward_arguments: bool) -> std::io::Result<()> {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::thread;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    let executable = std::env::current_exe()?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let ready_file = std::env::temp_dir().join(format!(
        "markdown-thing-ready-{}-{nonce}",
        std::process::id()
    ));
    let ready_argument = format!("--markdown-thing-ready={}", ready_file.display());

    let mut command = Command::new(executable);
    if forward_arguments {
        command.args(
            std::env::args_os()
                .skip(1)
                .filter(|argument| !is_reserved_argument(argument)),
        );
    }
    command
        .arg(ready_argument)
        .env("MARKDOWN_THING_GUI", "1")
        .env("MARKDOWN_THING_READY_FILE", &ready_file)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command.process_group(0);
    command.spawn()?;

    let mut ready = false;
    for _ in 0..1000 {
        if ready_file.exists() {
            ready = true;
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    let _ = std::fs::remove_file(ready_file);
    if ready {
        Ok(())
    } else {
        Err(std::io::Error::new(
            std::io::ErrorKind::TimedOut,
            "Markdown Thing did not become ready",
        ))
    }
}

fn main() {
    #[cfg(all(unix, not(debug_assertions)))]
    if std::env::var_os("MARKDOWN_THING_GUI").is_none() {
        let arguments: Vec<_> = std::env::args_os().skip(1).collect();
        let handoff = match handoff_command(&arguments) {
            Ok(handoff) => handoff,
            Err(error) => {
                eprintln!("Could not show Markdown: {error}");
                std::process::exit(2);
            }
        };
        match handoff {
            Some(HandoffCommand::Show(title)) => {
                let content = match read_show_input(std::io::stdin().lock()) {
                    Ok(content) => content,
                    Err(error) => {
                        eprintln!("Could not show Markdown: {error}");
                        std::process::exit(2);
                    }
                };
                if let Err(first_error) =
                    markdown_thing_lib::handoff::send_document(&title, &content)
                {
                    if let Err(error) = launch_detached(false) {
                        eprintln!("Could not launch Markdown Thing: {error}");
                        std::process::exit(1);
                    }
                    if let Err(error) = markdown_thing_lib::handoff::send_document(&title, &content)
                    {
                        eprintln!(
                            "Could not show Markdown: {error} (initial connection: {first_error})"
                        );
                        std::process::exit(1);
                    }
                }
                return;
            }
            Some(HandoffCommand::Stream(title)) => {
                if !markdown_thing_lib::handoff::is_server_available() {
                    if let Err(error) = launch_detached(false) {
                        eprintln!("Could not launch Markdown Thing: {error}");
                        std::process::exit(1);
                    }
                }
                if let Err(error) =
                    markdown_thing_lib::handoff::send_stream(&title, std::io::stdin().lock())
                {
                    eprintln!("Could not stream Markdown: {error}");
                    std::process::exit(1);
                }
                return;
            }
            None => {
                if let Err(error) = launch_detached(true) {
                    eprintln!("Could not launch Markdown Thing: {error}");
                    std::process::exit(1);
                }
                return;
            }
        }
    }

    markdown_thing_lib::run();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::{OsStr, OsString};

    #[test]
    fn recognizes_reserved_readiness_arguments() {
        assert!(is_reserved_argument(OsStr::new(
            "--markdown-thing-ready=/tmp/ready"
        )));
        assert!(!is_reserved_argument(OsStr::new("notes.md")));
    }

    #[test]
    fn parses_handoff_commands() {
        assert_eq!(
            handoff_command(&[OsString::from("show")]).unwrap(),
            Some(HandoffCommand::Show("Agent response".to_owned()))
        );
        assert_eq!(
            handoff_command(&[
                OsString::from("stream"),
                OsString::from("--title"),
                OsString::from("Code review")
            ])
            .unwrap(),
            Some(HandoffCommand::Stream("Code review".to_owned()))
        );
        assert!(handoff_command(&[OsString::from("stream"), OsString::from("extra")]).is_err());
        assert_eq!(
            handoff_command(&[OsString::from("notes.md")]).unwrap(),
            None
        );
    }

    #[test]
    fn bounds_and_validates_show_input() {
        assert_eq!(read_show_input("# Report".as_bytes()).unwrap(), "# Report");
        assert!(read_show_input([0xff].as_slice()).is_err());
        assert!(read_show_input(vec![b'x'; MAX_SHOW_BYTES as usize + 1].as_slice()).is_err());
    }
}
