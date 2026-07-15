mod files;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(files::FileAuthorization::default())
        .invoke_handler(tauri::generate_handler![
            files::open_markdown,
            files::save_markdown,
            files::save_markdown_as,
            files::load_local_image
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Markdown Thing");
}
