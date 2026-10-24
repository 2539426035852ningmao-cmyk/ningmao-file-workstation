use ningmao_desktop_lib::{
    desktop::{Layout, Rect, clamp_position},
    store::Store,
};
use std::fs;
#[test]
fn named_shelves_and_atomic_cross_shelf_reference_copy_preserve_sources() {
    let root = tempfile::tempdir().unwrap();
    let file = root.path().join("中文 原件.txt");
    fs::write(&file, b"keep original").unwrap();
    let db = root.path().join("state.sqlite3");
    let mut store = Store::open(&db).unwrap();
    let id = store.add_reference(1, &file).unwrap();
    store.set_tags(id, vec!["精选".into()]).unwrap();
    let target = store.create_shelf("项目素材", false).unwrap();
    let session = store.create_shelf("临时项目", true).unwrap();
    assert!(store.copy_references(target, &[id, 999999]).is_err());
    assert!(
        !store
            .snapshot()
            .unwrap()
            .items
            .iter()
            .any(|i| i.shelf_id == target)
    );
    assert_eq!(store.copy_references(target, &[id]).unwrap(), 1);
    assert_eq!(store.copy_references(target, &[id]).unwrap(), 0);
    store.copy_references(session, &[id]).unwrap();
    assert!(store.create_shelf("  ", false).is_err());
    assert!(store.create_shelf("项目素材", false).is_err());
    let bound = store.bind_directory(root.path()).unwrap();
    assert!(store.copy_references(bound, &[id]).is_err());
    store.clean_exit().unwrap();
    drop(store);
    let mut store = Store::open(&db).unwrap();
    let s = store.snapshot().unwrap();
    assert!(s.items.iter().any(|i| i.id == id && i.shelf_id == 1));
    assert!(
        s.items
            .iter()
            .any(|i| i.shelf_id == target && i.tags == ["精选"])
    );
    assert!(!s.items.iter().any(|i| i.shelf_id == session));
    assert_eq!(fs::read(file).unwrap(), b"keep original");
    store.integrity_check().unwrap();
}
#[test]
fn dock_keeps_explicit_ids_and_latches_native_drop_target() {
    let mut layout = Layout::default();
    layout.collapse(1);
    layout.collapse(2);
    layout.collapse(1);
    assert_eq!(layout.collapsed, vec![1, 2]);
    layout.begin_drag();
    assert_eq!(layout.hover_target(8.0, 1.0), Some(1));
    assert_eq!(layout.hover_target(70.0, 1.0), Some(2));
    layout.active_shelf = 99;
    assert_eq!(layout.drop_target(70.0, 1.0), Some(2));
    assert_eq!(layout.drop_target(70.0, 1.0), None);
    layout.open(1);
    assert!(!layout.collapsed.contains(&1));
    assert_eq!(layout.active_shelf, 1);
    layout.begin_drag();
    layout.cancel_drag();
    assert_eq!(layout.drop_target(8.0, 1.0), None);
}
#[test]
fn monitor_clamping_handles_negative_coordinates_small_work_areas_and_roundtrip() {
    let area = Rect {
        x: -1920,
        y: 0,
        width: 1920,
        height: 1040,
    };
    assert_eq!(clamp_position((-5000, 4000), (64, 128), area), (-1920, 912));
    assert_eq!(
        clamp_position(
            (300, 300),
            (640, 720),
            Rect {
                x: 0,
                y: 0,
                width: 320,
                height: 240
            }
        ),
        (0, 0)
    );
    let mut layout = Layout::default();
    layout.collapse(2);
    layout.entry_position = Some((-1200, 90));
    let json = serde_json::to_string(&layout).unwrap();
    let restored: Layout = serde_json::from_str(&json).unwrap();
    assert_eq!(restored.collapsed, vec![2]);
    assert_eq!(restored.entry_position, Some((-1200, 90)));
}
