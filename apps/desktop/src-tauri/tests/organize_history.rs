use ningmao_desktop_lib::store::Store;

#[test]
fn existing_v2_workspace_is_backed_up_before_history_is_installed() {
    let root = tempfile::tempdir().unwrap();
    let db = root.path().join("work.sqlite3");
    {
        let mut store = Store::open(&db).unwrap();
        store.rename_shelf(1, "既有数据").unwrap();
    }
    let old = rusqlite::Connection::open(&db).unwrap();
    let triggers = old
        .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'history_%'")
        .unwrap()
        .query_map([], |r| r.get::<_, String>(0))
        .unwrap()
        .collect::<std::result::Result<Vec<_>, _>>()
        .unwrap();
    for name in triggers {
        old.execute_batch(&format!("DROP TRIGGER \"{name}\";"))
            .unwrap();
    }
    old.execute_batch("DROP TABLE history_changes;DROP TABLE history_context;DROP TABLE history_steps;DROP TABLE history_settings;").unwrap();
    drop(old);
    let mut store = Store::open(&db).unwrap();
    assert_eq!(store.snapshot().unwrap().shelves[0].name, "既有数据");
    let backup = std::fs::read_dir(root.path())
        .unwrap()
        .map(|e| e.unwrap().path())
        .find(|p| p.to_string_lossy().contains("pre-organize-history"))
        .unwrap();
    let backup = rusqlite::Connection::open(backup).unwrap();
    assert_eq!(
        backup
            .query_row("SELECT name FROM shelves WHERE id=1", [], |r| r
                .get::<_, String>(0))
            .unwrap(),
        "既有数据"
    );
    assert_eq!(
        backup
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name='history_steps'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
        0
    );
    assert_eq!(
        backup
            .query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0))
            .unwrap(),
        "ok"
    );
}

#[test]
fn batch_reference_history_preserves_jobs_and_does_not_restore_cleared_session_items() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("original.txt");
    std::fs::write(&source, b"keep").unwrap();
    let db = root.path().join("work.sqlite3");
    let mut store = Store::open(&db).unwrap();
    let first = store.add_reference(1, &source).unwrap();
    let second = store.add_reference(2, &source).unwrap();
    let job = store.begin_job(1, "synthetic copy").unwrap();
    store.remove_references(&[first, second]).unwrap();
    store.history_apply(false).unwrap();
    assert_eq!(store.snapshot().unwrap().items.len(), 2);
    assert!(
        store
            .snapshot()
            .unwrap()
            .jobs
            .iter()
            .any(|j| j.id == job && j.status == "queued")
    );
    store.clean_exit().unwrap();
    drop(store);
    let mut store = Store::open(&db).unwrap();
    while store.history_state().unwrap().undo.is_some() {
        store.history_apply(false).unwrap();
    }
    assert!(
        !store
            .snapshot()
            .unwrap()
            .items
            .iter()
            .any(|i| i.shelf_id == 2)
    );
    assert_eq!(std::fs::read(source).unwrap(), b"keep");
    store.integrity_check().unwrap();
}

#[test]
fn history_persists_groups_batches_and_preserves_source_and_jobs() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("source.txt");
    std::fs::write(&path, b"untouched").unwrap();
    let db = root.path().join("work.sqlite3");
    let mut store = Store::open(&db).unwrap();
    let item = store.add_reference(1, &path).unwrap();
    store
        .record_history("批量整理", 1, |s| {
            s.set_tags(item, vec!["first".into()])?;
            s.rename_shelf(1, "新架名")
        })
        .unwrap();
    assert_eq!(
        store.history_state().unwrap().undo.as_deref(),
        Some("批量整理")
    );
    drop(store);
    let mut store = Store::open(&db).unwrap();
    store.history_apply(false).unwrap();
    let snapshot = store.snapshot().unwrap();
    assert_eq!(snapshot.shelves[0].name, "灵感收集");
    assert!(
        snapshot
            .items
            .iter()
            .find(|r| r.id == item)
            .unwrap()
            .tags
            .is_empty()
    );
    store.history_apply(true).unwrap();
    assert_eq!(store.snapshot().unwrap().shelves[0].name, "新架名");
    store.history_apply(false).unwrap();
    store.set_tags(item, vec!["new branch".into()]).unwrap();
    assert!(store.history_state().unwrap().redo.is_none());
    assert!(
        store
            .record_history("失败", 1, |s| {
                s.rename_shelf(1, "不应保留")?;
                Err::<(), _>("模拟失败".into())
            })
            .is_err()
    );
    assert_eq!(store.snapshot().unwrap().shelves[0].name, "灵感收集");
    assert_eq!(std::fs::read(&path).unwrap(), b"untouched");
    assert!(store.snapshot().unwrap().jobs.is_empty());
    store.integrity_check().unwrap();
}

#[test]
fn history_limits_and_external_changes_never_overwrite_current_data() {
    let root = tempfile::tempdir().unwrap();
    let db = root.path().join("work.sqlite3");
    let mut store = Store::open(&db).unwrap();
    assert_eq!(store.history_state().unwrap().capacity, 100);
    assert!(store.history_capacity(1001).is_err());
    store.history_capacity(2).unwrap();
    for name in ["一", "二", "三"] {
        store.rename_shelf(1, name).unwrap();
    }
    store.history_apply(false).unwrap();
    store.history_apply(false).unwrap();
    assert!(store.history_state().unwrap().undo.is_none());
    assert_eq!(store.snapshot().unwrap().shelves[0].name, "一");
    store.history_apply(true).unwrap();
    let other = rusqlite::Connection::open(&db).unwrap();
    other
        .execute("UPDATE shelves SET name='外部更新' WHERE id=1", [])
        .unwrap();
    assert!(store.history_state().unwrap().undo.is_none());
    assert!(store.history_state().unwrap().redo.is_none());
    assert_eq!(store.snapshot().unwrap().shelves[0].name, "外部更新");
}
