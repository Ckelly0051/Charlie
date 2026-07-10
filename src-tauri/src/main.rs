#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_fs::FsExt;

/// Grant the webview + fs plugin access to a coach-chosen film library folder at
/// runtime, so clips can be REFERENCED and played in place (no copy into app
/// data). Called from JS when the coach picks/opens a library folder and on
/// startup for the saved root. Additive — the static $APPDATA scope (managed
/// film) is untouched, so existing games keep working even if this fails.
#[tauri::command]
fn allow_library_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("library folder does not exist: {}", path));
    }
    // Asset protocol: lets the WebView stream video via convertFileSrc from here.
    app.asset_protocol_scope()
        .allow_directory(&p, true)
        .map_err(|e| e.to_string())?;
    // Fs plugin: lets listFilmFiles / read metadata under here.
    app.fs_scope()
        .allow_directory(&p, true)
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![allow_library_dir])
        .run(tauri::generate_context!())
        .expect("error while running GridIron IQ");
}
