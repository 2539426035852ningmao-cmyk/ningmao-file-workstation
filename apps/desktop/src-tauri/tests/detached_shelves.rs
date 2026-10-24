use ningmao_desktop_lib::{
    desktop::{Layout, WindowDrags, WindowGeometry, detached_id},
    store::Store,
};
use std::fs;
#[test]
fn detach_merge_and_restore_keep_fixed_ownership_even_when_main_is_empty() {
    let mut layout = Layout::default();
    layout.detach(1, &[1, 2]).unwrap();
    assert_eq!(layout.active_shelf, 2);
    layout.detach(2, &[1, 2]).unwrap();
    assert_eq!(layout.active_shelf, 0);
    assert_eq!(layout.file_scope("shelf-1").unwrap(), Some(1));
    for label in [
        "shelf-01",
        "shelf--1",
        "shelf-0",
        "shelf-3",
        "shelf-1-extra",
        "manager",
    ] {
        assert!(layout.file_scope(label).is_err());
    }
    assert_eq!(detached_id("shelf-01"), None);
    layout.detached[0].geometry = Some(WindowGeometry {
        x: -1500,
        y: 80,
        width: 420.0,
        height: 520.0,
    });
    let restored: Layout = serde_json::from_str(&serde_json::to_string(&layout).unwrap()).unwrap();
    assert!(restored.validate());
    layout.merge(1).unwrap();
    assert_eq!(layout.active_shelf, 1);
    assert!(layout.file_scope("shelf-1").is_err());
    layout.reconcile(&[1]);
    assert!(layout.detached.is_empty());
    let mut drags = WindowDrags::default();
    drags.outgoing.insert("shelf-1".into());
    drags.incoming.insert("shelf-1".into());
    drags.incoming.clear();
    assert!(drags.busy());
    drags.outgoing.clear();
    assert!(!drags.busy());
}
#[test]
fn scoped_snapshots_and_item_commands_never_touch_another_shelf() {
    let root = tempfile::tempdir().unwrap();
    let file = root.path().join("原件.txt");
    fs::write(&file, b"source").unwrap();
    let hidden = root.path().join("hidden");
    fs::create_dir(&hidden).unwrap();
    let mut store = Store::open(&root.path().join("state.db")).unwrap();
    let a = store.add_reference(1, &file).unwrap();
    let b = store.add_reference(2, &file).unwrap();
    store.set_tags(a, vec!["原标签".into()]).unwrap();
    let bound = store.bind_directory(&hidden).unwrap();
    fs::write(hidden.join("不应枚举.txt"), b"private fixture").unwrap();
    let snapshot = store.snapshot_scoped(Some(1), &[]).unwrap();
    assert_eq!(snapshot.shelves.len(), 1);
    assert_eq!(snapshot.items.len(), 1);
    assert_eq!(snapshot.items[0].id, a);
    assert_eq!(store.management_snapshot().unwrap().items.len(), 2);
    assert!(store.validate_item_scope(Some(1), &[b]).is_err());
    store.validate_item_scope(Some(1), &[a]).unwrap();
    let job = store.begin_job(2, "synthetic").unwrap();
    assert!(store.validate_job_scope(Some(1), job).is_err());
    let own_job = store.begin_job(1, "owned older job").unwrap();
    for _ in 0..22 {
        store.begin_job(2, "other shelf").unwrap();
    }
    let owned = store.snapshot_scoped(Some(1), &[]).unwrap();
    assert_eq!(owned.jobs.len(), 1);
    assert_eq!(owned.jobs[0].id, own_job);
    let main = store.snapshot_scoped(None, &[1, bound]).unwrap();
    assert!(main.items.iter().all(|i| i.shelf_id == 2));
    assert_eq!(fs::read(file).unwrap(), b"source");
    store.integrity_check().unwrap();
}
