use ningmao_desktop_lib::store::Store;
use std::fs;
#[test]
fn management_is_metadata_only_and_batch_tags_are_atomic() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("原件.txt");
    fs::write(&path, b"original").unwrap();
    let bound = root.path().join("bound");
    fs::create_dir(&bound).unwrap();
    let mut store = Store::open(&root.path().join("state.db")).unwrap();
    let first = store.add_reference(1, &path).unwrap();
    let second = store.add_reference(2, &path).unwrap();
    store.set_tags(first, vec!["原标签".into()]).unwrap();
    let bound_id = store.bind_directory(&bound).unwrap();
    fs::write(bound.join("尚未收集.txt"), b"not enumerated").unwrap();
    assert!(
        store
            .tag_references(&[first, 999999], "新标签", false)
            .is_err()
    );
    assert_eq!(
        store.management_snapshot().unwrap().items[0].tags,
        ["原标签"]
    );
    store
        .tag_references(&[first, second], "项目", false)
        .unwrap();
    store
        .tag_references(&[first, second], "项目", false)
        .unwrap();
    store.tag_references(&[first], "原标签", true).unwrap();
    fs::remove_file(&path).unwrap();
    let data = store.management_snapshot().unwrap();
    assert_eq!(data.items.len(), 2);
    assert!(data.items.iter().all(|i| i.kind == "txt"));
    assert!(
        data.items
            .iter()
            .all(|i| i.shelf_id != bound_id && i.tags == ["项目"])
    );
    fs::write(&path, b"original").unwrap();
    assert_eq!(fs::read(path).unwrap(), b"original");
    store.integrity_check().unwrap();
}
