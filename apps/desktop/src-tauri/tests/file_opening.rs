use ningmao_desktop_lib::store::{Store, needs_open_confirmation};
use std::fs;

#[test]
fn opening_only_resolves_registered_existing_paths_without_mutating_files_or_classification() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("中文 空格 & + [素材].txt");
    fs::write(&path, b"keep-source-bytes").unwrap();
    let mut store = Store::open(&root.path().join("state.sqlite3")).unwrap();
    let id = store.add_reference(1, &path).unwrap();
    store.set_tags(id, vec!["精选".into()]).unwrap();
    let before = serde_json::to_value(store.snapshot().unwrap()).unwrap();
    let target = store.opening_target(id).unwrap();
    assert_eq!(target, fs::canonicalize(&path).unwrap());
    store.validate_opening_target(id, &target).unwrap();
    assert!(store.opening_target(i64::MAX).is_err());
    assert_eq!(
        serde_json::to_value(store.snapshot().unwrap()).unwrap(),
        before
    );
    assert_eq!(fs::read(&path).unwrap(), b"keep-source-bytes");
    fs::remove_file(&path).unwrap();
    assert!(store.opening_target(id).is_err());
    assert!(store.validate_opening_target(id, &target).is_err());
    let snapshot = store.snapshot().unwrap();
    assert_eq!(snapshot.items[0].id, id);
    assert_eq!(snapshot.items[0].tags, ["精选"]);
    store.integrity_check().unwrap();
}

#[test]
fn confirmation_must_not_open_a_relocated_or_removed_reference() {
    let root = tempfile::tempdir().unwrap();
    let old = root.path().join("确认前.EXE");
    let new = root.path().join("移动后.exe");
    fs::write(&old, b"synthetic-not-a-program").unwrap();
    let mut store = Store::open(&root.path().join("state.sqlite3")).unwrap();
    let id = store.add_reference(1, &old).unwrap();
    let target = store.opening_target(id).unwrap();
    assert!(needs_open_confirmation(&target));
    fs::rename(&old, &new).unwrap();
    store.relink_reference(id, &target, &new).unwrap();
    assert!(store.validate_opening_target(id, &target).is_err());
    let target = store.opening_target(id).unwrap();
    store.remove_reference(id).unwrap();
    assert!(store.validate_opening_target(id, &target).is_err());
    assert_eq!(fs::read(new).unwrap(), b"synthetic-not-a-program");
    for name in ["a.cmd", "a.PS1", "shortcut.lnk", "installer.MSI", "a.url"] {
        assert!(
            needs_open_confirmation(std::path::Path::new(name)),
            "{name}"
        );
    }
    assert!(!needs_open_confirmation(std::path::Path::new("image.png")));
}

#[cfg(windows)]
#[test]
fn replaced_reference_cannot_open_an_alternate_stream_or_directory_junction() {
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("folder");
    fs::create_dir(&directory).unwrap();
    let mut store = Store::open(&root.path().join("state.sqlite3")).unwrap();
    let id = store.add_reference(1, &directory).unwrap();
    let expected = store.opening_target(id).unwrap();
    fs::remove_dir(&directory).unwrap();
    let other = root.path().join("other");
    fs::create_dir(&other).unwrap();
    assert!(
        std::process::Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(&directory)
            .arg(&other)
            .output()
            .unwrap()
            .status
            .success()
    );
    assert!(store.opening_target(id).is_err());
    assert!(store.validate_opening_target(id, &expected).is_err());
    fs::remove_dir(&directory).unwrap();
    // A crafted stored path is not accepted merely because its ID exists.
    let db = rusqlite::Connection::open(root.path().join("state.sqlite3")).unwrap();
    db.execute(
        "UPDATE items SET path=?1 WHERE id=?2",
        rusqlite::params![format!("{}:hidden", other.display()), id],
    )
    .unwrap();
    assert!(store.opening_target(id).is_err());
}
