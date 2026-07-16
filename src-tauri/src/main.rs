#[cfg(any(test, all(unix, not(debug_assertions))))]
const READY_ARGUMENT_PREFIX: &str = "--markdown-thing-ready=";
#[cfg(any(test, all(unix, not(debug_assertions))))]
const MAX_SHOW_BYTES: u64 = 10 * 1024 * 1024;
#[cfg(any(test, all(unix, not(debug_assertions))))]
const MAX_TITLE_BYTES: usize = 256;

#[cfg(any(test, all(unix, not(debug_assertions))))]
fn is_reserved_argument(argument: &std::ffi::OsStr) -> bool {
    argument
        .to_string_lossy()
        .starts_with(READY_ARGUMENT_PREFIX)
}

#[cfg(any(test, all(unix, not(debug_assertions))))]
fn show_title(arguments: &[std::ffi::OsString]) -> Result<Option<String>, String> {
    if arguments.first().is_none_or(|argument| argument != "show") {
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
            return Err(format!("Unknown show option: {argument}"));
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
    Ok(Some(title))
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
fn prepare_show() -> Result<Option<(String, String)>, String> {
    let arguments: Vec<_> = std::env::args_os().skip(1).collect();
    let Some(title) = show_title(&arguments)? else {
        return Ok(None);
    };
    let content = read_show_input(std::io::stdin().lock())?;
    Ok(Some((title, content)))
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

    for _ in 0..150 {
        if ready_file.exists() {
            break;
        }
        thread::sleep(Duration::from_millis(10));
    }
    let _ = std::fs::remove_file(ready_file);
    Ok(())
}

fn main() {
    #[cfg(all(unix, not(debug_assertions)))]
    let show = if std::env::var_os("MARKDOWN_THING_GUI").is_none() {
        match prepare_show() {
            Ok(show) => show,
            Err(error) => {
                eprintln!("Could not show Markdown: {error}");
                std::process::exit(2);
            }
        }
    } else {
        None
    };

    #[cfg(all(unix, not(debug_assertions)))]
    if std::env::var_os("MARKDOWN_THING_GUI").is_none() {
        if let Some(show) = &show {
            if let Err(first_error) = send_show(show) {
                if let Err(error) = launch_detached(false) {
                    eprintln!("Could not launch Markdown Thing: {error}");
                    std::process::exit(1);
                }
                if let Err(error) = send_show(show) {
                    eprintln!(
                        "Could not show Markdown: {error} (initial connection: {first_error})"
                    );
                    std::process::exit(1);
                }
            }
            return;
        }
        if let Err(error) = launch_detached(true) {
            eprintln!("Could not launch Markdown Thing: {error}");
            std::process::exit(1);
        }
        return;
    }

    markdown_thing_lib::run();
}

#[cfg(all(unix, not(debug_assertions)))]
fn send_show(show: &(String, String)) -> Result<(), String> {
    markdown_thing_lib::handoff::send_document(&show.0, &show.1)
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
    fn parses_show_titles() {
        assert_eq!(
            show_title(&[OsString::from("show")]).unwrap(),
            Some("Agent response".to_owned())
        );
        assert_eq!(
            show_title(&[
                OsString::from("show"),
                OsString::from("--title"),
                OsString::from("Code review")
            ])
            .unwrap(),
            Some("Code review".to_owned())
        );
        assert!(show_title(&[OsString::from("show"), OsString::from("extra")]).is_err());
        assert_eq!(show_title(&[OsString::from("notes.md")]).unwrap(), None);
    }

    #[test]
    fn bounds_and_validates_show_input() {
        assert_eq!(read_show_input("# Report".as_bytes()).unwrap(), "# Report");
        assert!(read_show_input([0xff].as_slice()).is_err());
        assert!(read_show_input(vec![b'x'; MAX_SHOW_BYTES as usize + 1].as_slice()).is_err());
    }
}
