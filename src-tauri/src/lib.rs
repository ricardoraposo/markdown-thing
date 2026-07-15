mod files;

use std::path::Path;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, arguments, cwd| {
            let authorization = app.state::<files::FileAuthorization>();
            match files::launched_document(&authorization, &arguments, Path::new(&cwd)) {
                Ok(Some(document)) => {
                    let _ = app.emit("open-document", document);
                }
                Ok(None) => {}
                Err(error) => {
                    let _ = app.emit("open-document-error", error);
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(files::FileAuthorization::default())
        .manage(files::startup_file_from_env())
        .invoke_handler(tauri::generate_handler![
            files::initial_document,
            files::save_markdown,
            files::load_local_image
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Markdown Thing");
}
