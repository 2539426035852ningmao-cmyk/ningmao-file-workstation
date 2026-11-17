use ningmao_desktop_lib::desktop::Layout;

#[test]
fn detach_and_return_preserve_parent_and_existing_children() {
    let mut layout = Layout::default();
    layout.active_shelf = 2;
    layout.detach(2, &[1, 2, 3]).unwrap();
    assert_eq!(layout.active_shelf, 2);
    layout.detach(3, &[1, 2, 3]).unwrap();
    layout.merge(3).unwrap();
    assert_eq!(layout.active_shelf, 2);
    assert_eq!(layout.detached.len(), 1);
    layout.reconcile(&[1, 2, 3]);
    assert_eq!(layout.active_shelf, 2);
}

#[test]
fn tenth_child_is_rejected_without_modifying_registered_windows() {
    let mut layout = Layout::default();
    let catalog: Vec<_> = (1..=10).collect();
    for id in 1..=9 { layout.detach(id, &catalog).unwrap(); }
    assert!(layout.detach(10, &catalog).is_err());
    assert_eq!(layout.detached.len(), 9);
    let numbers: Vec<_> = layout.detached.iter().map(|s| s.number).collect();
    assert_eq!(numbers, (1..=9).collect::<Vec<_>>());
    layout.merge(3).unwrap();
    layout.detach(10, &catalog).unwrap();
    assert_eq!(layout.detached.last().unwrap().number, 3);
    assert_eq!(layout.detached[3].number, 5);
    let restored: Layout = serde_json::from_str(&serde_json::to_string(&layout).unwrap()).unwrap();
    assert_eq!(restored.detached.last().unwrap().number, 3);
}
