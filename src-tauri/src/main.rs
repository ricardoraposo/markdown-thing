#[cfg(all(unix, not(debug_assertions)))]
fn launch_detached() -> std::io::Result<()> {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};

    let executable = std::env::current_exe()?;
    let mut command = Command::new(executable);
    command
        .args(std::env::args_os().skip(1))
        .env("MARKDOWN_THING_GUI", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command.process_group(0);
    command.spawn()?;
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
