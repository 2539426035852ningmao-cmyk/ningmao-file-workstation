use ningmao_desktop_lib::store::Store;
use rusqlite::Connection;
use std::fs;

#[test]
fn read_only_search_groups_real_identity_and_hides_paths() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let path = root.join("workstation.sqlite3");
    let mut store = Store::open(&path).unwrap();
    let third = store.create_shelf("素材参考", false).unwrap();
    let role = root.join("角色 Design.png");
    fs::write(&role, b"synthetic image metadata").unwrap();
    let a = store.add_reference(1, &role).unwrap();
    store.set_tags(a, vec!["收藏".into()]).unwrap();
    store.add_reference(third, &role).unwrap();
    let alias = root.join("alias.png");
    fs::hard_link(&role, &alias).unwrap();
    store.add_reference(third, &alias).unwrap();
    let copy = root.join("角色 Copy.png");
    fs::copy(&role, &copy).unwrap();
    store.add_reference(third, &copy).unwrap();
    let missing = root.join("角色 offline.txt");
    fs::write(&missing, b"synthetic").unwrap();
    let removed = store.add_reference(1, &missing).unwrap();
    fs::remove_file(&missing).unwrap();
    let db = Connection::open(&path).unwrap();
    let before: i64 = db
        .query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))
        .unwrap();
    let hits = store.search_metadata(None, "角色", "all").unwrap();
    assert_eq!(hits.hits.len(), 3);
    assert!(hits.hits.iter().any(|h| h.references.len() == 3));
    assert!(hits.hits.iter().any(|h| h.status == "missing"));
    let tagged = store.search_metadata(None, "收藏", "png").unwrap();
    assert_eq!(tagged.hits.len(), 1);
    assert_eq!(tagged.hits[0].references.len(), 3);
    assert_eq!(
        store
            .search_metadata(None, "DESIGN", "all")
            .unwrap()
            .hits
            .len(),
        1
    );
    assert_eq!(
        store
            .search_metadata(Some(1), "角色", "png")
            .unwrap()
            .hits
            .len(),
        1
    );
    assert!(
        store
            .search_metadata(None, "workstation.sqlite3", "all")
            .unwrap()
            .hits
            .is_empty()
    );
    let json = serde_json::to_string(&hits).unwrap();
    assert!(!json.contains(root.to_str().unwrap()));
    assert!(!json.contains("\"path\""));
    assert!(!json.contains("\"tags\""));
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM items", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        before
    );
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        2
    );
    assert!(store.validate_search_location(Some(third), 1, a).is_err());
    store.validate_search_location(None, 1, removed).unwrap(); // missing refs can still be located
    store.remove_reference(removed).unwrap();
    assert!(store.validate_search_location(None, 1, removed).is_err());
    assert_eq!(
        store
            .search_metadata(None, "offline", "all")
            .unwrap()
            .hits
            .len(),
        0
    );
    let catalog = store.search_catalog(None).unwrap();
    store.remove_reference(a).unwrap();
    let mut stale = catalog.search("收藏", "all").unwrap();
    assert_eq!(stale.hits.len(), 1);
    store.revalidate_search(None, &mut stale).unwrap();
    // A match from a removed tagged reference cannot survive via another untagged ref.
    assert!(stale.hits.is_empty());
}

#[test]
fn searching_bound_metadata_does_not_scan_or_register_new_files() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let bound = root.join("bound");
    fs::create_dir(&bound).unwrap();
    fs::write(bound.join("known.txt"), b"known").unwrap();
    let mut store = Store::open(&root.join("db")).unwrap();
    store.bind_directory(&bound).unwrap();
    store.snapshot().unwrap(); // prepare the already-registered baseline, before the search
    fs::write(bound.join("unregistered.txt"), b"must not index").unwrap();
    assert!(
        store
            .search_metadata(None, "unregistered", "all")
            .unwrap()
            .hits
            .is_empty()
    );
    assert_eq!(
        store
            .search_metadata(None, "KNOWN", "txt")
            .unwrap()
            .hits
            .len(),
        1
    );
    assert!(
        store
            .search_metadata(None, &"a".repeat(161), "all")
            .is_err()
    );
}
