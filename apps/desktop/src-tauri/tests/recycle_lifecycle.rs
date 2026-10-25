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
