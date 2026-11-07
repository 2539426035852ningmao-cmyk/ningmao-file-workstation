use ningmao_desktop_lib::store::Store;
#[test]
fn staged_restore_keeps_current_data_until_restart_and_retains_rollback() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("workstation.sqlite3");
    let backup = root.path().join("selected.sqlite3");
    let mut original = Store::open(&path).unwrap();
    original.create_shelf("需要恢复的文件架", false).unwrap();
    original.backup_to(&backup).unwrap();
    original.create_shelf("恢复前的新增记录", false).unwrap();
    Store::stage_restore(&backup, root.path()).unwrap();
    assert!(
        original
            .snapshot()
            .unwrap()
            .shelves
            .iter()
            .any(|s| s.name == "恢复前的新增记录")
    );
    drop(original);
    let rollback = Store::apply_pending_restore(root.path()).unwrap().unwrap();
    let mut restored = Store::open(&path).unwrap();
    assert!(
        restored
            .snapshot()
            .unwrap()
            .shelves
            .iter()
            .any(|s| s.name == "需要恢复的文件架")
    );
    assert!(
        !restored
            .snapshot()
            .unwrap()
            .shelves
            .iter()
            .any(|s| s.name == "恢复前的新增记录")
    );
    let mut previous = Store::open(&rollback).unwrap();
    assert!(
        previous
            .snapshot()
            .unwrap()
            .shelves
            .iter()
            .any(|s| s.name == "恢复前的新增记录")
    );
    assert!(Store::apply_pending_restore(root.path()).unwrap().is_none());
}
#[test]
fn invalid_backup_does_not_schedule_or_modify_current_data() {
    let root = tempfile::tempdir().unwrap();
    let bad = root.path().join("bad.sqlite3");
    std::fs::write(&bad, b"synthetic invalid backup").unwrap();
    assert!(Store::stage_restore(&bad, root.path()).is_err());
    assert!(!root.path().join("restore-pending.sqlite3").exists());
}
#[test]
fn backup_includes_committed_wal_and_does_not_overwrite() {
    let directory = tempfile::tempdir().unwrap();
    let mut original = Store::open(&directory.path().join("source.sqlite3")).unwrap();
    original.create_shelf("备份前", false).unwrap();
    let target = directory.path().join("backup.sqlite3");
    original.backup_to(&target).unwrap();
    original.create_shelf("备份后", false).unwrap();
    let mut backup = Store::open(&target).unwrap();
    assert!(
        backup
            .snapshot()
            .unwrap()
            .shelves
            .iter()
            .any(|s| s.name == "备份前")
    );
    assert!(
        !backup
            .snapshot()
            .unwrap()
            .shelves
            .iter()
            .any(|s| s.name == "备份后")
    );
    assert!(original.backup_to(&target).is_err());
    assert!(
        original
            .snapshot()
            .unwrap()
            .shelves
            .iter()
            .any(|s| s.name == "备份后")
    );
}

#[test]
fn a_damaged_current_database_can_be_restored_without_losing_raw_evidence() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("workstation.sqlite3");
    let backup = root.path().join("good.sqlite3");
    let mut original = Store::open(&path).unwrap();
    original.create_shelf("损坏后应恢复", false).unwrap();
    original.backup_to(&backup).unwrap();
    Store::stage_restore(&backup, root.path()).unwrap();
    drop(original);
    let damaged = b"synthetic damaged SQLite header";
    std::fs::write(&path, damaged).unwrap();
    let rollback = Store::apply_pending_restore(root.path()).unwrap().unwrap();
    assert_eq!(std::fs::read(rollback).unwrap(), damaged);
    let mut restored = Store::open(&path).unwrap();
    assert!(
        restored
            .snapshot()
            .unwrap()
            .shelves
            .iter()
            .any(|s| s.name == "损坏后应恢复")
    );
}

#[test]
fn recovery_does_not_downgrade_a_newer_database() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("workstation.sqlite3");
    let backup = root.path().join("good.sqlite3");
    let original = Store::open(&path).unwrap();
    original.backup_to(&backup).unwrap();
    Store::stage_restore(&backup, root.path()).unwrap();
    drop(original);
    let db = rusqlite::Connection::open(&path).unwrap();
    db.pragma_update(None, "user_version", 99).unwrap();
    drop(db);
    assert!(Store::apply_pending_restore(root.path()).is_err());
    let db = rusqlite::Connection::open(&path).unwrap();
    assert_eq!(
        db.pragma_query_value::<i64, _>(None, "user_version", |row| row.get(0))
            .unwrap(),
        99
    );
}
