use std::path::Path;

fn spelling(path: &Path) -> Option<String> {
    if !path.is_absolute() { return None; }
    let mut text = path.to_str()?.replace('\\', "/");
    if text.get(..8).is_some_and(|s| s.eq_ignore_ascii_case("//?/UNC/")) {
        text = format!("//{}", &text[8..]);
    } else if text.starts_with("//?/") {
        if !text.as_bytes().get(5).is_some_and(|c| *c == b':') { return None; }
        text = text[4..].to_owned();
    }
    if text.starts_with("//./") || text.split('/').any(|part| part == "." || part == ".." || part.ends_with(['.', ' '])) {
        return None;
    }
    text = text.trim_end_matches('/').to_owned();
    if cfg!(windows) { text.make_ascii_lowercase(); }
    Some(text)
}

pub fn authorize(path: &str, approved_roots: &[String], directory: bool) -> Result<std::path::PathBuf, String> {
    let input = Path::new(path);
    let requested = spelling(input).ok_or("Film path must be absolute and have a safe spelling")?;
    // Resolve only supplied roots first. An unrelated target must not cause an
    // OS lookup (notably a connection to an unapproved network share).
    let roots: Vec<_> = approved_roots.iter().filter_map(|root| {
        let input = Path::new(root);
        let original = spelling(input)?;
        let canonical = input.canonicalize().ok().filter(|p| p.is_dir())?;
        Some((original, canonical))
    }).collect();
    let under = |base: &str| requested == base || requested.starts_with(&format!("{base}/"));
    if !roots.iter().any(|(original, canonical)| under(original) || spelling(canonical).is_some_and(|s| under(&s))) {
        return Err("Film path has not been approved on this computer".into());
    }
    let target = input.canonicalize().map_err(|e| e.to_string())?;
    if (directory && !target.is_dir()) || (!directory && !target.is_file()) {
        return Err("Film path has the wrong type".into());
    }
    let approved = roots.iter().any(|(_, root)| target.starts_with(root));
    if !approved { return Err("Film path has not been approved on this computer".into()); }
    Ok(target)
}

pub fn safe_id(id: &str) -> bool {
    let first = id.as_bytes().first().copied();
    if !first.is_some_and(|c| c.is_ascii_alphanumeric())
        || !id.bytes().all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
        || id.ends_with('.')
    {
        return false;
    }
    let stem = id.split('.').next().unwrap_or("").to_ascii_uppercase();
    !matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        && !(stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

pub fn delete_managed(base: &Path, season_id: &str, game_id: &str) -> Result<(), String> {
    if !safe_id(season_id) || !safe_id(game_id) {
        return Err("Unsafe film owner ID".into());
    }
    let base = base.canonicalize().map_err(|e| e.to_string())?;
    let root = base.join("seasons").join(season_id).join("films");
    let target = root.join(game_id);
    let metadata = match std::fs::symlink_metadata(&target) {
        Ok(metadata) => metadata,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.to_string()),
    };
    let canonical_root = root.canonicalize().map_err(|e| e.to_string())?;
    let canonical_target = target.canonicalize().map_err(|e| e.to_string())?;
    if canonical_root != root
        || metadata.file_type().is_symlink()
        || canonical_target.parent() != Some(canonical_root.as_path())
        || canonical_target == canonical_root
        || !metadata.is_dir()
    {
        return Err("Film folder is outside its owning game".into());
    }
    std::fs::remove_dir_all(&target).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch() -> PathBuf {
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("giq-film-path-{}-{nonce}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn unsafe_ids_never_delete_film() {
        let base = scratch();
        let films = base.join("seasons/safe-season/films");
        std::fs::create_dir_all(films.join("keep-game")).unwrap();
        for id in [".", "..", "a/b", "a\\b", "a.", "CON", "nul.json", "LPT1", "a:stream", " a"] {
            assert!(delete_managed(&base, "safe-season", id).is_err());
            assert!(delete_managed(&base, id, "keep-game").is_err());
            assert!(films.join("keep-game").exists());
        }
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn normal_deletion_preserves_siblings() {
        let base = scratch();
        let films = base.join("seasons/safe-season/films");
        std::fs::create_dir_all(films.join("delete-game")).unwrap();
        std::fs::create_dir_all(films.join("keep-game")).unwrap();
        std::fs::write(films.join("keep-game/clip.mp4"), b"keep").unwrap();
        delete_managed(&base, "safe-season", "delete-game").unwrap();
        assert!(!films.join("delete-game").exists());
        assert_eq!(std::fs::read(films.join("keep-game/clip.mp4")).unwrap(), b"keep");
        delete_managed(&base, "safe-season", "missing-game").unwrap();
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn linked_paths_are_authorized_by_canonical_identity() {
        let base = scratch();
        let root = base.join("approved");
        let sibling = base.join("approved-other");
        std::fs::create_dir_all(root.join("week-1")).unwrap();
        std::fs::create_dir_all(&sibling).unwrap();
        std::fs::write(root.join("week-1/clip.mp4"), b"film").unwrap();
        let roots = vec![root.to_string_lossy().into_owned()];
        assert!(authorize(root.to_str().unwrap(), &roots, true).is_ok());
        assert!(authorize(root.join("week-1/clip.mp4").to_str().unwrap(), &roots, false).is_ok());
        assert!(authorize(sibling.to_str().unwrap(), &roots, true).is_err());
        assert_eq!(authorize(base.join("unapproved-missing/clip.mp4").to_str().unwrap(), &roots, false).unwrap_err(),
            "Film path has not been approved on this computer");
        assert!(authorize(root.join("../approved-other").to_str().unwrap(), &roots, true).is_err());
        assert!(authorize(root.to_str().unwrap(), &[], true).is_err());
        assert!(authorize("relative", &roots, true).is_err());
        assert!(authorize(root.to_str().unwrap(), &roots, false).is_err());
        #[cfg(windows)]
        assert!(authorize(root.join("week-1").to_str().unwrap(), &[root.to_string_lossy().to_uppercase()], true).is_ok());
        let explicit = vec![sibling.to_string_lossy().into_owned()];
        assert!(authorize(sibling.to_str().unwrap(), &explicit, true).is_ok());
        std::fs::remove_dir_all(base).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn a_game_junction_cannot_delete_another_folder() {
        use std::os::windows::process::CommandExt;
        let base = scratch();
        let root = base.join("seasons/safe-season/films");
        let other = base.join("other-film");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&other).unwrap();
        std::fs::write(other.join("clip.mp4"), b"keep").unwrap();
        let link = root.canonicalize().unwrap().join("linked-game");
        let other = other.canonicalize().unwrap();
        let output = std::process::Command::new("cmd.exe")
            .args(["/c", "mklink", "/J"]).arg(&link).arg(&other)
            .creation_flags(0x08000000).output().unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        let roots = vec![root.to_string_lossy().into_owned()];
        assert!(authorize(link.to_str().unwrap(), &roots, true).is_err());
        assert!(authorize(link.join("clip.mp4").to_str().unwrap(), &roots, false).is_err());
        assert!(authorize(link.to_str().unwrap(), &[other.to_string_lossy().into_owned()], true).is_err());
        let alias_roots = vec![link.to_string_lossy().into_owned()];
        assert!(authorize(link.to_str().unwrap(), &alias_roots, true).is_ok());
        assert!(authorize(other.join("clip.mp4").to_str().unwrap(), &alias_roots, false).is_ok());
        assert!(delete_managed(&base, "safe-season", "linked-game").is_err());
        assert_eq!(std::fs::read(other.join("clip.mp4")).unwrap(), b"keep");
        std::fs::remove_dir(link).unwrap();
        std::fs::remove_dir_all(base).unwrap();
    }
}
