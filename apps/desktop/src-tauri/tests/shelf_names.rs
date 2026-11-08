use ningmao_desktop_lib::store::Store;
use std::fs;

#[test]
fn rename_preserves_shelf_identity_references_tags_and_restart() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workstation.sqlite3");
    let source = dir.path().join("中文素材.txt");
    fs::write(&source, b"synthetic source remains unchanged").unwrap();
    let mut store = Store::open(&path).unwrap();
    let id = store.create_shelf("旧名称", false).unwrap();
    let item = store.add_reference(id, &source).unwrap();
    store.set_tags(item, vec!["收藏".into()]).unwrap();
    let before = store.snapshot().unwrap();
    store.rename_shelf(id, "  新名称 Work  ").unwrap();
    drop(store);
    let mut reopened = Store::open(&path).unwrap();
    let after = reopened.snapshot().unwrap();
    assert_eq!(
        after.shelves.iter().find(|s| s.id == id).unwrap().name,
        "新名称 Work"
    );
    assert_eq!(
        serde_json::to_value(before.items).unwrap(),
        serde_json::to_value(after.items).unwrap()
    );
    assert_eq!(
        fs::read(&source).unwrap(),
        b"synthetic source remains unchanged"
    );
}

#[test]
fn rename_reuses_name_rules_and_rejects_duplicate_or_missing_shelf() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("workstation.sqlite3")).unwrap();
    let id = store.create_shelf("保留名称", false).unwrap();
    let other = store.create_shelf("另一个架", false).unwrap();
    for name in [
        " ".into(),
        "坏\n名称".into(),
        "长".repeat(61),
        "另一个架".into(),
    ] {
        assert!(store.rename_shelf(id, &name).is_err());
    }
    store.rename_shelf(id, "保留名称").unwrap();
    assert!(store.rename_shelf(987654, "无目标").is_err());
    assert_eq!(
        store
            .shelf_catalog()
            .unwrap()
            .iter()
            .find(|s| s.id == other)
            .unwrap()
            .name,
        "另一个架"
    );
}

#[test]
fn bound_shelf_rename_does_not_rename_directory_and_recycled_shelf_is_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let bound = dir.path().join("bound-source");
    fs::create_dir(&bound).unwrap();
    fs::write(bound.join("source.txt"), b"protected synthetic source").unwrap();
    let mut store = Store::open(&dir.path().join("workstation.sqlite3")).unwrap();
    let id = store.bind_directory(&bound).unwrap();
    let before = store.snapshot().unwrap();
    let root = before
        .shelves
        .iter()
        .find(|s| s.id == id)
        .unwrap()
        .root
        .clone();
    store.rename_shelf(id, "绑定素材").unwrap();
    let after = store.snapshot().unwrap();
    let shelf = after.shelves.iter().find(|s| s.id == id).unwrap();
    assert_eq!(shelf.root, root);
    assert_eq!(shelf.name, "绑定素材");
    assert_eq!(
        fs::read(bound.join("source.txt")).unwrap(),
        b"protected synthetic source"
    );
    store.trash_shelf(id).unwrap();
    assert!(store.rename_shelf(id, "不能改名").is_err());
}
