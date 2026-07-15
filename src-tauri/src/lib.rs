mod files;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
