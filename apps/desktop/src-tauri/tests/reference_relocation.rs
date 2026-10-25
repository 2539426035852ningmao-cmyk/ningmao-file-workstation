use ningmao_desktop_lib::store::Store;
use std::fs;

#[test]
fn relocation_preserves_id_shelf_tags_and_manual_order_across_restart() {
    let root = tempfile::tempdir().unwrap();
    let original = root.path().join("原始 中文.txt");
    let replacement = root.path().join("移动并改名 #+[].txt");
    let another = root.path().join("second.txt");
    fs::write(&original, b"original-bytes").unwrap();
    fs::write(&another, b"second-bytes").unwrap();
    let db = root.path().join("data.sqlite3");
    let mut store = Store::open(&db).unwrap();
    let id = store.add_reference(1, &original).unwrap();
    let other = store.add_reference(1, &another).unwrap();
    store
        .set_tags(id, vec!["精选".into(), "分类保留".into()])
        .unwrap();
    store.reorder(1, &[other, id]).unwrap();
    fs::rename(&original, &replacement).unwrap();
    let expected = store.relocation_source(id).unwrap();
    store.relink_reference(id, &expected, &replacement).unwrap();
    drop(store);

    let mut store = Store::open(&db).unwrap();
    let snapshot = store.snapshot().unwrap();
    assert_eq!(
        snapshot.items.iter().map(|i| i.id).collect::<Vec<_>>(),
        [other, id]
    );
    let item = snapshot.items.iter().find(|i| i.id == id).unwrap();
    assert_eq!(item.shelf_id, 1);
    assert_eq!(item.tags, ["精选", "分类保留"]);
    assert_eq!(item.name, "移动并改名 #+[].txt");
    assert_eq!(
        item.path,
        fs::canonicalize(&replacement).unwrap().to_str().unwrap()
    );
    assert_eq!(item.status, "normal");
    assert!(!original.exists());
    assert_eq!(fs::read(replacement).unwrap(), b"original-bytes");
    assert_eq!(fs::read(another).unwrap(), b"second-bytes");
    store.integrity_check().unwrap();
}

#[test]
fn rejected_relocations_leave_both_records_and_disk_bytes_unchanged() {
    let root = tempfile::tempdir().unwrap();
    let original = root.path().join("missing.txt");
    let moved = root.path().join("moved.txt");
    let duplicate = root.path().join("already-referenced.txt");
    fs::write(&original, b"original").unwrap();
    fs::write(&duplicate, b"duplicate").unwrap();
    let mut store = Store::open(&root.path().join("data.sqlite3")).unwrap();
    let id = store.add_reference(1, &original).unwrap();
    let other = store.add_reference(1, &duplicate).unwrap();
    store.set_tags(id, vec!["保留".into()]).unwrap();
    store.reorder(1, &[other, id]).unwrap();
    assert!(
        store.relocation_source(id).is_err(),
        "existing reference is not broken"
    );
    fs::rename(&original, &moved).unwrap();
    let expected = store.relocation_source(id).unwrap();
    for candidate in [
        duplicate.clone(),
        root.path().join("not-found.txt"),
        "relative.txt".into(),
    ] {
        assert!(store.relink_reference(id, &expected, &candidate).is_err());
    }
    assert!(store.relink_reference(99999, &expected, &moved).is_err());
    assert!(
        store.relink_reference(id, &duplicate, &moved).is_err(),
        "stale source"
    );
    let snapshot = store.snapshot().unwrap();
    assert_eq!(
        snapshot.items.iter().map(|i| i.id).collect::<Vec<_>>(),
        [other, id]
    );
    assert_eq!(snapshot.items[1].path, expected.to_str().unwrap());
    assert_eq!(snapshot.items[1].tags, ["保留"]);
    fs::write(&original, b"original-path-restored").unwrap();
    assert!(store.relink_reference(id, &expected, &moved).is_err());
    assert_eq!(store.item_path(id).unwrap(), expected);
    assert_eq!(fs::read(original).unwrap(), b"original-path-restored");
    assert_eq!(fs::read(moved).unwrap(), b"original");
    assert_eq!(fs::read(duplicate).unwrap(), b"duplicate");
    store.integrity_check().unwrap();
}

#[test]
fn folder_and_session_relocations_preserve_scope_and_reject_bound_records() {
    let root = tempfile::tempdir().unwrap();
    let original = root.path().join("原文件夹");
    let moved = root.path().join("已选择的新文件夹");
    fs::create_dir(&original).unwrap();
    fs::write(original.join("child.txt"), b"untouched-child").unwrap();
    let mut store = Store::open(&root.path().join("data.sqlite3")).unwrap();
    let id = store.add_reference(2, &original).unwrap();
    store.set_tags(id, vec!["目录引用".into()]).unwrap();
    fs::rename(&original, &moved).unwrap();
    let expected = store.relocation_source(id).unwrap();
    store.relink_reference(id, &expected, &moved).unwrap();
    let snapshot = store.snapshot().unwrap();
    assert_eq!(snapshot.items[0].kind, "folder");
    assert_eq!(snapshot.items[0].tags, ["目录引用"]);
    assert_eq!(snapshot.items[0].shelf_id, 2);
    // The new folder is a reference, not an implicitly bound or enumerated directory.
    assert_eq!(snapshot.items.len(), 1);
    assert_eq!(snapshot.shelves.len(), 2);
    let shelf = store.bind_directory(&moved).unwrap();
    let bound = store
        .snapshot()
        .unwrap()
        .items
        .into_iter()
        .find(|i| i.shelf_id == shelf)
        .unwrap();
    assert!(store.relocation_source(bound.id).is_err());
    assert!(
        store
            .relink_reference(bound.id, std::path::Path::new(&bound.path), &moved)
            .is_err()
    );
    store.clean_exit().unwrap();
    assert!(
        store
            .snapshot()
            .unwrap()
            .items
            .iter()
            .all(|i| i.shelf_id != 2)
    );
    assert_eq!(
        fs::read(moved.join("child.txt")).unwrap(),
        b"untouched-child"
    );
    store.integrity_check().unwrap();
}

#[test]
fn missing_bound_reference_can_relocate_only_inside_unchanged_root() {
    let d = tempfile::tempdir().unwrap();
    let root = d.path().join("bound");
    std::fs::create_dir(&root).unwrap();
    let old = root.join("old.txt");
    std::fs::write(&old, b"keep").unwrap();
    let mut s = Store::open(&d.path().join("db.sqlite3")).unwrap();
    let shelf = s.bind_directory(&root).unwrap();
    let id = s.snapshot().unwrap().items[0].id;
    s.set_tags(id, vec!["same-id".into()]).unwrap();
    let new = root.join("new.txt");
    std::fs::rename(&old, &new).unwrap();
    let expected = s.relocation_source(id).unwrap();
    let outside = d.path().join("outside.txt");
    std::fs::write(&outside, b"outside").unwrap();
    assert!(s.relink_reference(id, &expected, &outside).is_err());
    s.relink_reference(id, &expected, &new).unwrap();
    let snap = s.snapshot().unwrap();
    let item = snap.items.iter().find(|i| i.id == id).unwrap();
    assert_eq!(item.name, "new.txt");
    assert_eq!(item.tags, vec!["same-id"]);
    assert_eq!(
        snap.shelves
            .iter()
            .find(|i| i.id == shelf)
            .unwrap()
            .root
            .as_ref()
            .unwrap(),
        &std::fs::canonicalize(root).unwrap().to_string_lossy()
    );
}
