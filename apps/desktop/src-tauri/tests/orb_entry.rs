use ningmao_desktop_lib::{
    desktop::{Edge, Layout, Rect},
    entry::{EntryState, Flow, Kind, place},
};

#[test]
fn presentation_and_native_drag_freeze_identity_and_geometry_until_cancel_or_drop() {
    let mut layout = Layout::default();
    layout.collapse(4);
    layout.collapse(7);
    let mut entry = EntryState::default();
    entry.present(&layout, 4, Kind::Capsule).unwrap();
    assert_eq!(entry.geometry(&layout).slots[0].width, 184.0);
    entry.present(&layout, 4, Kind::QuickPeek).unwrap();
    let before = serde_json::to_value(entry.geometry(&layout)).unwrap();
    assert_eq!(entry.begin_drag(&layout, 16.0, 16.0, 1.0), Some(4));
    assert!(entry.present(&layout, 7, Kind::Capsule).is_err());
    layout.collapsed.reverse();
    layout.preferences.edge = Edge::Top;
    assert_eq!(
        serde_json::to_value(entry.geometry(&layout)).unwrap(),
        before
    );
    assert_eq!(entry.over(16.0, 244.0, 1.0), Some(4));
    assert_eq!(entry.drop_target(16.0, 244.0, 1.0), None); // A different slot cannot silently steal the latched target.
    assert!(!entry.busy());
    entry.reset();
    layout.preferences.edge = Edge::Left;
    assert_eq!(entry.begin_drag(&layout, 16.0, 16.0, 1.0), Some(7));
    assert_eq!(entry.drop_target(16.0, 16.0, 1.0), Some(7));
    assert_eq!(entry.drop_target(16.0, 16.0, 1.0), None);
    entry.begin_drag(&layout, 16.0, 16.0, 1.0);
    entry.cancel_drag();
    assert_eq!(entry.drop_target(16.0, 16.0, 1.0), None);
}

#[test]
fn horizontal_vertical_and_hidden_edges_keep_real_targets_in_their_slots() {
    let mut layout = Layout::default();
    for id in 1..=8 {
        layout.collapse(id);
    }
    layout.page = 0;
    for edge in [Edge::Left, Edge::Right, Edge::Top, Edge::Bottom, Edge::Free] {
        layout.preferences.edge = edge;
        layout.preferences.flow = Flow::Horizontal;
        let mut entry = EntryState::default();
        let g = entry.geometry(&layout);
        let horizontal = matches!(edge, Edge::Top | Edge::Bottom | Edge::Free);
        assert_eq!(g.slots.len(), 5);
        assert_eq!(g.slots[1].x > g.slots[0].x, horizontal);
        for slot in &g.slots {
            assert_eq!(
                entry.begin_drag(&layout, (slot.x + 24.0) * 1.5, (slot.y + 24.0) * 1.5, 1.5),
                Some(slot.id)
            );
            entry.cancel_drag();
        }
        let pos = place(
            (-800, 5000),
            Rect {
                x: -1920,
                y: 0,
                width: 1920,
                height: 1040,
            },
            1.5,
            (g.width, g.height),
            edge,
        );
        assert!(pos.0 >= -1920 && pos.1 >= 0);
    }
    layout.edge_hidden = true;
    layout.preferences.edge = Edge::Top;
    let mut entry = EntryState::default();
    let g = entry.geometry(&layout);
    assert_eq!((g.width, g.height), (64.0, 18.0));
    assert_eq!(entry.begin_drag(&layout, 12.0, 9.0, 1.0), Some(1));
    assert_eq!(entry.geometry(&layout).height, 18.0); // Enter must not resize or move the physical handle.
}

#[test]
fn quick_peek_is_bounded_registered_metadata_without_paths_or_directory_scan() {
    use ningmao_desktop_lib::store::Store;
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(&root.path().join("test.sqlite3")).unwrap();
    for n in 0..5 {
        let path = root.path().join(format!("合成 {n}.txt"));
        std::fs::write(&path, b"keep").unwrap();
        store.add_reference(1, &path).unwrap();
        std::fs::remove_file(&path).unwrap(); // Metadata query must not stat or discard missing references.
    }
    let peek = store.entry_preview(1).unwrap();
    assert_eq!(peek.total, 5);
    assert_eq!(peek.items.len(), 3);
    assert_eq!(peek.items[0].name, "合成 4.txt");
    let json = serde_json::to_value(peek).unwrap();
    assert!(
        json["items"]
            .as_array()
            .unwrap()
            .iter()
            .all(|r| r.get("path").is_none())
    );
    assert!(store.entry_preview(999).is_err());
    store.integrity_check().unwrap();
}
