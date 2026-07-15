#[cfg(all(unix, not(debug_assertions)))]
fn launch_detached() -> std::io::Result<()> {
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
    command
        .args(std::env::args_os().skip(1))
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
    if std::env::var_os("MARKDOWN_THING_GUI").is_none() {
        if let Err(error) = launch_detached() {
            eprintln!("Could not launch Markdown Thing: {error}");
            std::process::exit(1);
        }
        return;
    }

    markdown_thing_lib::run();
}
