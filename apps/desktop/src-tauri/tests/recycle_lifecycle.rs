use ningmao_desktop_lib::store::Store;
use rusqlite::Connection;
#[test]
fn removed_reference_retains_recovery_record_without_touching_source() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("state.sqlite3");
    let file = root.path().join("synthetic.txt");
    std::fs::write(&file, b"keep").unwrap();
    let mut store = Store::open(&path).unwrap();
    let id = store.add_reference(1, &file).unwrap();
    store.remove_reference(id).unwrap();
    drop(store);
    let db = Connection::open(&path).unwrap();
    let count: i64 = db
        .query_row("SELECT COUNT(*) FROM items WHERE id=?1", [id], |r| r.get(0))
        .unwrap();
    assert_eq!(
        count, 1,
        "Removed references must remain recoverable records"
    );
    assert_eq!(std::fs::read(file).unwrap(), b"keep");
}
#[test]
fn restarting_initialized_empty_workstation_does_not_recreate_base_shelves() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("state.sqlite3");
    drop(Store::open(&path).unwrap());
    let db = Connection::open(&path).unwrap();
    db.execute("DELETE FROM shelves", []).unwrap();
    drop(db);
    let store = Store::open(&path).unwrap();
    assert!(
        store.shelf_catalog().unwrap().is_empty(),
        "Only a genuinely new database may seed base shelves"
    );
}

#[test]
fn shelf_restore_retains_ids_tags_order_and_individual_trash() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = Store::open(&dir.path().join("db.sqlite3")).unwrap();
    let a = dir.path().join("a.txt");
    let b = dir.path().join("b.txt");
    std::fs::write(&a, b"a").unwrap();
    std::fs::write(&b, b"b").unwrap();
    let i = s.add_reference(1, &a).unwrap();
    let j = s.add_reference(1, &b).unwrap();
    s.set_tags(i, vec!["original".into()]).unwrap();
    s.reorder(1, &[j, i]).unwrap();
    s.remove_reference(j).unwrap();
    s.trash_shelf(1).unwrap();
    assert!(s.snapshot().unwrap().items.is_empty());
    assert_eq!(s.trash_entries(None).unwrap().len(), 1);
    assert!(s.opening_target(i).is_err());
    s.restore_trash("shelf", 1).unwrap();
    let snap = s.snapshot().unwrap();
    assert_eq!(snap.items.len(), 1);
    assert_eq!(snap.items[0].id, i);
    assert_eq!(snap.items[0].tags, vec!["original"]);
    s.restore_trash("item", j).unwrap();
    assert_eq!(
        s.snapshot()
            .unwrap()
            .items
            .iter()
            .map(|i| i.id)
            .collect::<Vec<_>>(),
        vec![j, i]
    );
}
#[test]
fn all_shelves_can_be_recycled_and_purged_without_source_deletion() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("db.sqlite3");
    let f = dir.path().join("a.txt");
    std::fs::write(&f, b"keep").unwrap();
    let mut s = Store::open(&db).unwrap();
    s.add_reference(1, &f).unwrap();
    for id in [1, 2] {
        s.trash_shelf(id).unwrap();
    }
    assert!(s.shelf_catalog().unwrap().is_empty());
    assert_eq!(s.trash_entries(None).unwrap().len(), 2);
    for id in [1, 2] {
        s.purge_trash("shelf", id).unwrap();
    }
    drop(s);
    assert!(
        Store::open(&db)
            .unwrap()
            .shelf_catalog()
            .unwrap()
            .is_empty()
    );
    assert_eq!(std::fs::read(f).unwrap(), b"keep");
}
#[test]
fn bound_reference_does_not_reappear_during_scan_or_after_purge() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("bound");
    std::fs::create_dir(&root).unwrap();
    let f = root.join("a.txt");
    std::fs::write(&f, b"keep").unwrap();
    let mut s = Store::open(&dir.path().join("db.sqlite3")).unwrap();
    let shelf = s.bind_directory(&root).unwrap();
    let id = s.snapshot().unwrap().items[0].id;
    s.remove_reference(id).unwrap();
    assert!(s.snapshot().unwrap().items.is_empty());
    s.purge_trash("item", id).unwrap();
    assert!(s.snapshot().unwrap().items.is_empty());
    assert!(f.exists());
    assert!(s.shelf(shelf).is_ok());
}
#[test]
fn session_recycle_survives_clean_exit() {
    let dir = tempfile::tempdir().unwrap();
    let f = dir.path().join("a.txt");
    std::fs::write(&f, b"keep").unwrap();
    let db = dir.path().join("db.sqlite3");
    let mut s = Store::open(&db).unwrap();
    let id = s.add_reference(2, &f).unwrap();
    s.remove_reference(id).unwrap();
    s.clean_exit().unwrap();
    drop(s);
    let mut s = Store::open(&db).unwrap();
    assert_eq!(s.trash_entries(None).unwrap().len(), 1);
    s.restore_trash("item", id).unwrap();
    assert_eq!(s.snapshot().unwrap().items[0].id, id);
}
#[test]
fn v1_migration_backup_includes_uncheckpointed_wal_and_future_version_is_read_only() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("db.sqlite3");
    let db = Connection::open(&path).unwrap();
    db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE shelves(id INTEGER PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,root TEXT UNIQUE);CREATE TABLE items(id INTEGER PRIMARY KEY,shelf_id INTEGER NOT NULL REFERENCES shelves(id),path TEXT NOT NULL,name TEXT NOT NULL,position INTEGER NOT NULL,tags TEXT NOT NULL DEFAULT '[]',UNIQUE(shelf_id,path));CREATE TABLE jobs(id INTEGER PRIMARY KEY,shelf_id INTEGER NOT NULL REFERENCES shelves(id),status TEXT NOT NULL,message TEXT NOT NULL,staging TEXT);INSERT INTO shelves VALUES(7,'WAL-original','persistent',NULL);PRAGMA user_version=1;").unwrap();
    let s = Store::open(&path).unwrap();
    assert_eq!(s.shelf_catalog().unwrap()[0].id, 7);
    let backup = std::fs::read_dir(dir.path())
        .unwrap()
        .flatten()
        .find(|p| p.file_name().to_string_lossy().contains("pre-ui-b06"))
        .unwrap()
        .path();
    let b = Connection::open(backup).unwrap();
    assert_eq!(
        b.query_row("SELECT name FROM shelves WHERE id=7", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "WAL-original"
    );
    assert_eq!(
        b.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
    drop(s);
    db.execute_batch("PRAGMA user_version=99").unwrap();
    assert!(Store::open(&path).is_err());
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        99
    );
}

#[test]
fn purged_identity_is_never_reused_by_new_shelf_or_reference() {
    let d = tempfile::tempdir().unwrap();
    let mut s = Store::open(&d.path().join("db.sqlite3")).unwrap();
    let f = d.path().join("f.txt");
    std::fs::write(&f, b"safe").unwrap();
    let old = s.add_reference(1, &f).unwrap();
    s.remove_reference(old).unwrap();
    s.purge_trash("item", old).unwrap();
    let new = s.add_reference(1, &f).unwrap();
    assert!(new > old);
    for id in [1, 2] {
        s.trash_shelf(id).unwrap();
        s.purge_trash("shelf", id).unwrap();
    }
    assert!(s.create_shelf("new", false).unwrap() > 2);
}
#[test]
fn hundred_reference_shelf_restores_as_one_unit_without_touching_other_shelf() {
    let d = tempfile::tempdir().unwrap();
    let mut s = Store::open(&d.path().join("db.sqlite3")).unwrap();
    let mut ids = Vec::new();
    for n in 0..100 {
        let f = d.path().join(format!("synthetic-{n}.txt"));
        std::fs::write(&f, format!("payload-{n}")).unwrap();
        let id = s.add_reference(1, &f).unwrap();
        s.set_tags(id, vec![format!("tag-{n}")]).unwrap();
        ids.push(id);
        if n == 0 {
            s.add_reference(2, &f).unwrap();
        }
    }
    ids.reverse();
    s.reorder(1, &ids).unwrap();
    let before = s.snapshot().unwrap().items;
    s.trash_shelf(1).unwrap();
    assert_eq!(s.trash_entries(None).unwrap().len(), 1);
    assert_eq!(s.snapshot().unwrap().items.len(), 1);
    s.restore_trash("shelf", 1).unwrap();
    let after = s.snapshot().unwrap().items;
    assert_eq!(
        serde_json::to_value(before).unwrap(),
        serde_json::to_value(after).unwrap()
    );
    s.integrity_check().unwrap();
}
#[test]
fn pending_recycle_is_not_retried_and_recorded_os_success_finishes_metadata_only() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("db.sqlite3");
    let f = d.path().join("f.txt");
    std::fs::write(&f, b"keep").unwrap();
    let mut s = Store::open(&path).unwrap();
    let id = s.add_reference(1, &f).unwrap();
    let canonical = s.opening_target(id).unwrap();
    let j = s.begin_recycle(id, &canonical).unwrap();
    drop(s);
    let mut s = Store::open(&path).unwrap();
    assert_eq!(s.snapshot().unwrap().items.len(), 1);
    assert!(f.exists());
    drop(s);
    let db = Connection::open(&path).unwrap();
    let status: String = db
        .query_row("SELECT status FROM recycle_journal WHERE id=?1", [j], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(status, "uncertain");
    db.execute(
        "UPDATE recycle_journal SET status='os-success' WHERE id=?1",
        [j],
    )
    .unwrap();
    drop(db);
    // Synthetic recorded-success recovery: no OS operation is executed by startup.
    let s = Store::open(&path).unwrap();
    assert_eq!(s.trash_entries(None).unwrap()[0].id, id);
    assert_eq!(std::fs::read(f).unwrap(), b"keep");
}
