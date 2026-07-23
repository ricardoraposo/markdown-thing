#[cfg(any(test, all(unix, not(debug_assertions))))]
const READY_ARGUMENT_PREFIX: &str = "--markdown-thing-ready=";
#[cfg(any(test, all(unix, not(debug_assertions))))]
const MAX_SHOW_BYTES: u64 = 10 * 1024 * 1024;
#[cfg(any(test, all(unix, not(debug_assertions))))]
const MAX_TITLE_BYTES: usize = 256;
#[cfg(any(test, all(unix, not(debug_assertions))))]
const PI_EXTENSION_SOURCE: &str = include_str!("../../pi-extension/index.ts");

#[cfg(any(test, all(unix, not(debug_assertions))))]
#[derive(Debug, PartialEq, Eq)]
enum InstallOutcome {
    Installed(std::path::PathBuf),
    Current(std::path::PathBuf),
}

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
fn install_pi_extension_force(arguments: &[std::ffi::OsString]) -> Result<Option<bool>, String> {
    if arguments
        .first()
        .is_none_or(|argument| argument != "install-pi-extension")
    {
        return Ok(None);
    }
    match arguments.get(1..) {
        Some([]) => Ok(Some(false)),
        Some([force]) if force == "--force" => Ok(Some(true)),
        Some([option]) => Err(format!(
            "Unknown install-pi-extension option: {}",
            option.to_string_lossy()
        )),
        _ => Err("install-pi-extension accepts only --force".to_owned()),
    }
}

#[cfg(any(test, all(unix, not(debug_assertions))))]
fn install_pi_extension_at(
    agent_directory: &std::path::Path,
    force: bool,
) -> Result<InstallOutcome, String> {
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    use std::time::{SystemTime, UNIX_EPOCH};

    let extensions_directory = agent_directory.join("extensions");
    fs::create_dir_all(&extensions_directory)
        .map_err(|error| format!("Could not create Pi extensions directory: {error}"))?;
    let destination = extensions_directory.join("markdown-thing.ts");
    match fs::symlink_metadata(&destination) {
        Ok(metadata) => {
            if metadata.file_type().is_file()
                && fs::read(&destination)
                    .is_ok_and(|content| content == PI_EXTENSION_SOURCE.as_bytes())
            {
                return Ok(InstallOutcome::Current(destination));
            }
            if !force {
                return Err(format!(
                    "{} already exists; pass --force to replace it",
                    destination.display()
                ));
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "Could not inspect {}: {error}",
                destination.display()
            ))
        }
    }

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = extensions_directory.join(format!(
        ".markdown-thing.ts.{}-{nonce}.tmp",
        std::process::id()
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temporary)
            .map_err(|error| format!("Could not create Pi extension: {error}"))?;
        file.write_all(PI_EXTENSION_SOURCE.as_bytes())
            .and_then(|()| file.sync_all())
            .map_err(|error| format!("Could not write Pi extension: {error}"))?;
        fs::rename(&temporary, &destination)
            .map_err(|error| format!("Could not install Pi extension: {error}"))?;
        Ok(InstallOutcome::Installed(destination))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(all(unix, not(debug_assertions)))]
fn install_pi_extension(force: bool) -> Result<InstallOutcome, String> {
    let agent_directory = std::env::var_os("PI_CODING_AGENT_DIR")
        .filter(|value| !value.is_empty())
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME")
                .filter(|value| !value.is_empty())
                .map(|home| std::path::PathBuf::from(home).join(".pi/agent"))
        })
        .ok_or_else(|| "Could not determine the Pi agent directory".to_owned())?;
    install_pi_extension_at(&agent_directory, force)
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
        let install = match install_pi_extension_force(&arguments) {
            Ok(install) => install,
            Err(error) => {
                eprintln!("Could not install Pi extension: {error}");
                std::process::exit(2);
            }
        };
        if let Some(force) = install {
            match install_pi_extension(force) {
                Ok(InstallOutcome::Installed(path)) => {
                    println!("Installed Pi extension at {}", path.display());
                    println!("Run /reload in Pi, then /markdown-thing to enable streaming.");
                }
                Ok(InstallOutcome::Current(path)) => {
                    println!("Pi extension is already current at {}", path.display());
                }
                Err(error) => {
                    eprintln!("Could not install Pi extension: {error}");
                    std::process::exit(1);
                }
            }
            return;
        }
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
    use std::{
        ffi::{OsStr, OsString},
        fs,
        os::unix::fs::symlink,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temporary_agent_directory() -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "markdown-thing-pi-extension-test-{}-{nonce}",
            std::process::id()
        ))
    }

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
    fn parses_pi_extension_install_command() {
        assert_eq!(
            install_pi_extension_force(&[OsString::from("install-pi-extension")]).unwrap(),
            Some(false)
        );
        assert_eq!(
            install_pi_extension_force(&[
                OsString::from("install-pi-extension"),
                OsString::from("--force")
            ])
            .unwrap(),
            Some(true)
        );
        assert!(install_pi_extension_force(&[
            OsString::from("install-pi-extension"),
            OsString::from("--unknown")
        ])
        .is_err());
        assert_eq!(
            install_pi_extension_force(&[OsString::from("show")]).unwrap(),
            None
        );
    }

    #[test]
    fn installs_and_safely_replaces_the_pi_extension() {
        let agent_directory = temporary_agent_directory();
        let first = install_pi_extension_at(&agent_directory, false).unwrap();
        let destination = agent_directory.join("extensions/markdown-thing.ts");
        assert_eq!(first, InstallOutcome::Installed(destination.clone()));
        assert_eq!(
            fs::read_to_string(&destination).unwrap(),
            PI_EXTENSION_SOURCE
        );
        assert_eq!(
            install_pi_extension_at(&agent_directory, false).unwrap(),
            InstallOutcome::Current(destination.clone())
        );

        fs::write(&destination, "existing extension").unwrap();
        assert!(install_pi_extension_at(&agent_directory, false).is_err());
        assert_eq!(
            install_pi_extension_at(&agent_directory, true).unwrap(),
            InstallOutcome::Installed(destination.clone())
        );
        assert_eq!(
            fs::read_to_string(&destination).unwrap(),
            PI_EXTENSION_SOURCE
        );

        fs::remove_file(&destination).unwrap();
        let symlink_target = agent_directory.join("linked-extension.ts");
        fs::write(&symlink_target, PI_EXTENSION_SOURCE).unwrap();
        symlink(&symlink_target, &destination).unwrap();
        assert!(install_pi_extension_at(&agent_directory, false).is_err());
        assert_eq!(
            install_pi_extension_at(&agent_directory, true).unwrap(),
            InstallOutcome::Installed(destination.clone())
        );
        assert!(fs::symlink_metadata(&destination)
            .unwrap()
            .file_type()
            .is_file());
        fs::remove_dir_all(agent_directory).unwrap();
    }

    #[test]
    fn bounds_and_validates_show_input() {
        assert_eq!(read_show_input("# Report".as_bytes()).unwrap(), "# Report");
        assert!(read_show_input([0xff].as_slice()).is_err());
        assert!(read_show_input(vec![b'x'; MAX_SHOW_BYTES as usize + 1].as_slice()).is_err());
    }
}
