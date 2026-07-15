mod files;

use std::path::Path;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, arguments, cwd| {
            let authorization = app.state::<files::FileAuthorization>();
            let item = match files::launched_document(&authorization, &arguments, Path::new(&cwd)) {
                Ok(Some(document)) => Some(files::LaunchItem::Document(document)),
                Ok(None) => None,
                Err(error) => Some(files::LaunchItem::Error(error)),
            };
            if let Some(item) = item {
                let launch_queue = app.state::<files::LaunchQueue>();
                if launch_queue.push(item).is_ok() {
                    let _ = app.emit("launch-queued", ());
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            files::signal_ready_from_arguments(&arguments);
        }))
        .manage(files::FileAuthorization::default())
        .manage(files::LaunchQueue::default())
        .manage(files::startup_file_from_env())
        .setup(|_| {
            files::signal_ready_from_env();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            files::initial_document,
            files::drain_launch_queue,
            files::save_markdown,
            files::load_local_image
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Markdown Thing");
}
