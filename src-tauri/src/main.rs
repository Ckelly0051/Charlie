#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_fs::FsExt;
use tauri_plugin_opener::OpenerExt;
mod film_paths;

#[tauri::command]
fn delete_managed_film(app: tauri::AppHandle, season_id: String, game_id: String) -> Result<(), String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    film_paths::delete_managed(&base, &season_id, &game_id)
}

/// The trusted renderer supplies roots from machine settings/picker selections.
/// Refuse unrelated spellings before target lookup, then enforce canonical
/// containment. This is not a consent registry against renderer compromise.
#[tauri::command]
fn authorize_film_path(app: tauri::AppHandle, path: String, approved_roots: Vec<String>, directory: bool) -> Result<String, String> {
    let p = film_paths::authorize(&path, &approved_roots, directory)?;
    if directory {
        app.asset_protocol_scope().allow_directory(&p, true).map_err(|e| e.to_string())?;
        app.fs_scope().allow_directory(&p, true).map_err(|e| e.to_string())?;
    } else {
        app.asset_protocol_scope().allow_file(&p).map_err(|e| e.to_string())?;
        app.fs_scope().allow_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(p.to_string_lossy().into_owned())
}

/// Open a coach-approved film folder in the OS file manager. The folder must
/// already be inside the runtime asset/fs scope granted by authorize_film_path;
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

/// Replace the catalog only after its staged bytes are complete. The staged
/// file is in the same directory, so a failed write leaves library.db intact.
#[tauri::command]
fn replace_catalog_db(app: tauri::AppHandle, temp_name: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("seasons");
    replace_catalog_file(&dir, &temp_name)
}

fn replace_catalog_file(dir: &std::path::Path, temp_name: &str) -> Result<(), String> {
    let suffix = temp_name
        .strip_prefix("library.db.pending-")
        .ok_or("Invalid catalog staging name")?;
    if suffix.is_empty() || !suffix.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("Invalid catalog staging name".into());
    }
    let staged = dir.join(temp_name);
    let target = dir.join("library.db");
    let file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&staged)
        .map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() == 0 {
        return Err("Catalog staging file is empty".into());
    }
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    std::fs::rename(&staged, &target).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::replace_catalog_file;

    #[test]
    fn replacing_existing_catalog_keeps_the_old_file_until_stage_is_ready() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("giq-catalog-test-{}-{nonce}", std::process::id()));
        std::fs::create_dir(&dir).unwrap();
        let target = dir.join("library.db");
        std::fs::write(&target, b"old").unwrap();
        assert!(replace_catalog_file(&dir, "library.db.pending-abcd").is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"old");
        std::fs::write(dir.join("library.db.pending-abcd"), b"new").unwrap();
        replace_catalog_file(&dir, "library.db.pending-abcd").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"new");
        std::fs::remove_file(target).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            authorize_film_path,
            open_library_dir,
            close_after_flush,
            replace_catalog_db,
            delete_managed_film
        ])
        .run(tauri::generate_context!())
        .expect("error while running GridIron IQ");
}
