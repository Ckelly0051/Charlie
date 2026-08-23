#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_fs::FsExt;
use tauri_plugin_opener::OpenerExt;

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

/// Open a coach-approved film folder in the OS file manager. The folder must
/// already be inside the runtime asset/fs scope granted by allow_library_dir;
/// imported season data cannot use this command to open an arbitrary path.
#[tauri::command]
fn open_library_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path)
        .canonicalize()
        .map_err(|e| format!("film folder is unavailable: {e}"))?;
    if !p.is_dir() {
        return Err(format!("film folder is not a directory: {}", path));
    }
    if !app.asset_protocol_scope().is_allowed(&p) || !app.fs_scope().is_allowed(&p) {
        return Err("film folder has not been approved for this session".into());
    }
    app.opener()
        .open_path(p.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Close the desktop window after JavaScript has durably flushed pending saves.
/// This runs natively so it does not re-enter the webview close-request hook.
#[tauri::command]
fn close_after_flush(window: tauri::WebviewWindow) -> Result<(), String> {
    window.destroy().map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            allow_library_dir,
            open_library_dir,
            close_after_flush
        ])
        .run(tauri::generate_context!())
        .expect("error while running GridIron IQ");
}
