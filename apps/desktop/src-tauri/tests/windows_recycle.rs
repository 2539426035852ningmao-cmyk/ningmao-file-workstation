#![cfg(windows)]
use ningmao_desktop_lib::windows_recycle::{execute, inspect};
use sha2::{Digest, Sha256};
// Shell undo/progress is user-session state. Match the application's single
// LifecycleGuard owner instead of issuing concurrent IFileOperation requests.
static SYSTEM_RECYCLE: std::sync::Mutex<()> = std::sync::Mutex::new(());
#[test]
fn real_windows_recycle_returns_same_entity_and_preserves_payload() {
    let _serial = SYSTEM_RECYCLE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let workspace = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(5)
        .unwrap()
        .join("work/ui-b06-recycle-fixtures");
    std::fs::create_dir_all(&workspace).unwrap();
    let dir = tempfile::tempdir_in(&workspace).unwrap();
    let f = dir.path().join("宁猫 synthetic recycle.txt");
    std::fs::write(&f, b"NINGMAO-SYNTHETIC-RECYCLE-ONLY").unwrap();
    let protected = dir.path().join("protected");
    std::fs::create_dir(&protected).unwrap();
    let before = format!("{:x}", Sha256::digest(std::fs::read(&f).unwrap()));
    let plan = inspect(&f, &protected).unwrap();
    let recycled = execute(&plan, &protected).unwrap();
    let after = format!("{:x}", Sha256::digest(std::fs::read(&recycled).unwrap()));
    assert_eq!(before, after);
    println!("SYNTHETIC_RECYCLE_SHA256 source={before} recycled={after}");
    assert!(!f.exists());
    assert_eq!(
        std::fs::read(recycled).unwrap(),
        b"NINGMAO-SYNTHETIC-RECYCLE-ONLY"
    );
}
#[test]
fn replacement_and_protected_files_are_rejected_without_deleting_anything() {
    let _serial = SYSTEM_RECYCLE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let workspace = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(5)
        .unwrap()
        .join("work/ui-b06-recycle-fixtures");
    std::fs::create_dir_all(&workspace).unwrap();
    let dir = tempfile::tempdir_in(&workspace).unwrap();
    let f = dir.path().join("safe.txt");
    std::fs::write(&f, b"old").unwrap();
    let protected = dir.path().join("protected");
    std::fs::create_dir(&protected).unwrap();
    let p = inspect(&f, &protected).unwrap();
    std::fs::write(&f, b"changed").unwrap();
    assert!(execute(&p, &protected).is_err());
    assert_eq!(std::fs::read(&f).unwrap(), b"changed");
    let secret = protected.join("synthetic-config.txt");
    std::fs::write(&secret, b"not-private").unwrap();
    assert!(inspect(&secret, &protected).is_err());
    assert!(secret.exists());
    assert!(inspect(dir.path(), &protected).is_err());
}

#[test]
fn actual_recycle_moves_only_initiating_reference_and_keeps_other_tags() {
    let _serial = SYSTEM_RECYCLE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    use ningmao_desktop_lib::store::Store;
    let workspace = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(5)
        .unwrap()
        .join("work/ui-b06-recycle-fixtures");
    std::fs::create_dir_all(&workspace).unwrap();
    let d = tempfile::tempdir_in(workspace).unwrap();
    let protected = d.path().join("data");
    std::fs::create_dir(&protected).unwrap();
    let f = d.path().join("two-shelves.txt");
    std::fs::write(&f, b"shared-synthetic").unwrap();
    let mut s = Store::open(&protected.join("db.sqlite3")).unwrap();
    let a = s.add_reference(1, &f).unwrap();
    let b = s.add_reference(2, &f).unwrap();
    s.set_tags(b, vec!["keep-tag".into()]).unwrap();
    let target = inspect(&f, &protected).unwrap();
    let journal = s.begin_recycle(a, &target.path).unwrap();
    let recycled = execute(&target, &protected).unwrap();
    s.recycle_result(journal, "os-success", "Synthetic OS-confirmed result")
        .unwrap();
    let snapshot = s.snapshot().unwrap();
    assert_eq!(snapshot.items.len(), 1);
    assert_eq!(snapshot.items[0].id, b);
    assert_eq!(snapshot.items[0].status, "missing");
    assert_eq!(snapshot.items[0].tags, vec!["keep-tag"]);
    assert_eq!(s.trash_entries(None).unwrap()[0].id, a);
    s.restore_trash("item", a).unwrap();
    assert!(
        s.snapshot()
            .unwrap()
            .items
            .iter()
            .all(|i| i.status == "missing")
    );
    assert_eq!(std::fs::read(recycled).unwrap(), b"shared-synthetic");
}
