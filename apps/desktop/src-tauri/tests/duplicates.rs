#![cfg(windows)]
use ningmao_desktop_lib::store::Store;
use std::fs;

#[test]
fn duplicate_analysis_distinguishes_hard_links_and_same_content_copies() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let mut store = Store::open(&root.join("db.sqlite3")).unwrap();
    let shelf = store.create_shelf("另一个架", false).unwrap();
    let original = root.join("original.txt");
    let hard = root.join("hard.txt");
    let copy = root.join("copy.txt");
    let other = root.join("other.txt");
    fs::write(&original, b"synthetic equal bytes").unwrap();
    fs::hard_link(&original, &hard).unwrap();
    fs::copy(&original, &copy).unwrap();
    fs::write(&other, b"synthetic other bytes").unwrap();
    let a = store.add_reference(1, &original).unwrap();
    let b = store.add_reference(shelf, &hard).unwrap();
    let c = store.add_reference(1, &copy).unwrap();
    let d = store.add_reference(1, &other).unwrap();
    let scan = store
        .prepare_duplicate_scan(None, &[a, b, c, d])
        .unwrap()
        .analyze_checked(|_, _| Ok(()))
        .unwrap();
    let report = store.finish_duplicate_scan(None, scan).unwrap();
    assert_eq!(report.same_entity, vec![vec![a, b]]);
    assert_eq!(report.duplicate_contents, vec![vec![vec![a, b], vec![c]]]);
    let rendered = serde_json::to_string(&report).unwrap();
    assert!(!rendered.contains(root.to_str().unwrap()));
    assert!(!rendered.contains("path"));
    assert_eq!(fs::read(&original).unwrap(), b"synthetic equal bytes");
    assert_eq!(fs::read(&copy).unwrap(), b"synthetic equal bytes");
    assert!(store.prepare_duplicate_scan(Some(shelf), &[a, b]).is_err());
    assert!(store.prepare_duplicate_scan(None, &[a, a]).is_err());
}

#[test]
fn revoked_or_relocated_reference_invalidates_analysis_result() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("db.sqlite3")).unwrap();
    let a = dir.path().join("a.txt");
    let b = dir.path().join("b.txt");
    fs::write(&a, b"synthetic").unwrap();
    fs::write(&b, b"synthetic").unwrap();
    let id_a = store.add_reference(1, &a).unwrap();
    let id_b = store.add_reference(1, &b).unwrap();
    let scan = store
        .prepare_duplicate_scan(None, &[id_a, id_b])
        .unwrap()
        .analyze_checked(|_, _| Ok(()))
        .unwrap();
    store.remove_reference(id_a).unwrap();
    assert!(store.finish_duplicate_scan(None, scan).is_err());
    assert!(a.exists() && b.exists());
}

#[test]
fn held_readonly_handles_prevent_source_modification_or_replacement() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let folder = root.join("selected");
    fs::create_dir(&folder).unwrap();
    let a = folder.join("a.txt");
    let b = folder.join("b.txt");
    fs::write(&a, b"synthetic").unwrap();
    fs::write(&b, b"synthetic").unwrap();
    let mut store = Store::open(&root.join("db.sqlite3")).unwrap();
    let id_a = store.add_reference(1, &a).unwrap();
    let id_b = store.add_reference(1, &b).unwrap();
    let pending = store
        .prepare_duplicate_scan(None, &[id_a, id_b])
        .unwrap()
        .analyze_checked(|_, _| Ok(()))
        .unwrap();
    assert!(fs::OpenOptions::new().write(true).open(&a).is_err());
    assert!(fs::rename(&a, folder.join("moved.txt")).is_err());
    assert!(fs::rename(&folder, root.join("moved-dir")).is_err());
    let report = store.finish_duplicate_scan(None, pending).unwrap();
    assert_eq!(report.duplicate_contents.len(), 1);
    assert!(fs::OpenOptions::new().write(true).open(&a).is_ok());
    assert_eq!(fs::read(&a).unwrap(), b"synthetic");
}

#[test]
fn replaced_ancestor_junction_is_rejected_without_reading_target() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let source = root.join("source");
    let saved = root.join("saved");
    let target = root.join("target");
    fs::create_dir(&source).unwrap();
    fs::create_dir(&target).unwrap();
    fs::write(source.join("a.txt"), b"original").unwrap();
    fs::write(target.join("a.txt"), b"unselected target").unwrap();
    fs::write(root.join("b.txt"), b"original").unwrap();
    let mut store = Store::open(&root.join("db.sqlite3")).unwrap();
    let a = store.add_reference(1, &source.join("a.txt")).unwrap();
    let b = store.add_reference(1, &root.join("b.txt")).unwrap();
    let plan = store.prepare_duplicate_scan(None, &[a, b]).unwrap();
    fs::rename(&source, &saved).unwrap();
    assert!(
        std::process::Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(&source)
            .arg(&target)
            .output()
            .unwrap()
            .status
            .success()
    );
    assert!(plan.analyze_checked(|_, _| Ok(())).is_err());
    fs::remove_dir(&source).unwrap();
    assert_eq!(fs::read(saved.join("a.txt")).unwrap(), b"original");
    assert_eq!(
        fs::read(target.join("a.txt")).unwrap(),
        b"unselected target"
    );
}

#[test]
fn revocation_during_analysis_stops_before_returning_results() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join("db.sqlite3")).unwrap();
    let a = dir.path().join("a.txt");
    let b = dir.path().join("b.txt");
    fs::write(&a, b"synthetic").unwrap();
    fs::write(&b, b"synthetic").unwrap();
    let id_a = store.add_reference(1, &a).unwrap();
    let id_b = store.add_reference(1, &b).unwrap();
    let plan = store.prepare_duplicate_scan(None, &[id_a, id_b]).unwrap();
    let mut calls = 0;
    let result = plan.analyze_checked(|id, _| {
        calls += 1;
        if calls == 3 {
            store.remove_reference(id)?;
        }
        store.validate_item_scope(None, &[id])
    });
    assert!(result.is_err());
    assert!(calls >= 3);
    assert_eq!(fs::read(&a).unwrap(), b"synthetic");
    assert_eq!(fs::read(&b).unwrap(), b"synthetic");
}

#[test]
fn cancel_during_scan_releases_file_and_directory_handles() {
    let dir = tempfile::tempdir().unwrap();
    let folder = dir.path().join("selected");
    fs::create_dir(&folder).unwrap();
    let a = folder.join("a.txt");
    let b = folder.join("b.txt");
    fs::write(&a, b"synthetic").unwrap();
    fs::write(&b, b"synthetic").unwrap();
    let mut store = Store::open(&dir.path().join("db.sqlite3")).unwrap();
    let a_id = store.add_reference(1, &a).unwrap();
    let b_id = store.add_reference(1, &b).unwrap();
    let plan = store.prepare_duplicate_scan(None, &[a_id, b_id]).unwrap();
    let mut calls = 0;
    let result = plan.analyze_checked(|_, _| {
        calls += 1;
        if calls == 3 {
            Err("比较已取消。".into())
        } else {
            Ok(())
        }
    });
    assert!(result.is_err());
    assert!(calls >= 3);
    assert!(fs::OpenOptions::new().write(true).open(&a).is_ok());
    let moved = dir.path().join("moved");
    fs::rename(&folder, &moved).unwrap();
    assert_eq!(fs::read(moved.join("a.txt")).unwrap(), b"synthetic");
}

#[test]
fn hard_link_references_are_counted_once_for_size_limit() {
    let dir = tempfile::tempdir().unwrap();
    let original = dir.path().join("large-synthetic.bin");
    let alias = dir.path().join("same-entity.bin");
    let file = fs::File::create(&original).unwrap();
    file.set_len(129 * 1024 * 1024).unwrap();
    drop(file);
    fs::hard_link(&original, &alias).unwrap();
    let mut store = Store::open(&dir.path().join("db.sqlite3")).unwrap();
    let a = store.add_reference(1, &original).unwrap();
    let b = store.add_reference(1, &alias).unwrap();
    let plan = store.prepare_duplicate_scan(None, &[a, b]).unwrap();
    let pending = plan.analyze_checked(|_, _| Ok(())).unwrap();
    let report = store.finish_duplicate_scan(None, pending).unwrap();
    assert_eq!(report.same_entity, vec![vec![a, b]]);
    assert!(report.duplicate_contents.is_empty());
    assert_eq!(fs::metadata(&original).unwrap().len(), 129 * 1024 * 1024);
}

#[test]
fn distinct_large_files_still_obey_total_size_limit() {
    let dir = tempfile::tempdir().unwrap();
    let first = dir.path().join("first.bin");
    let second = dir.path().join("second.bin");
    for path in [&first, &second] {
        let file = fs::File::create(path).unwrap();
        file.set_len(129 * 1024 * 1024).unwrap();
    }
    let mut store = Store::open(&dir.path().join("db.sqlite3")).unwrap();
    let a = store.add_reference(1, &first).unwrap();
    let b = store.add_reference(1, &second).unwrap();
    let plan = store.prepare_duplicate_scan(None, &[a, b]).unwrap();
    assert!(plan.analyze_checked(|_, _| Ok(())).is_err());
    assert_eq!(fs::metadata(first).unwrap().len(), 129 * 1024 * 1024);
    assert_eq!(fs::metadata(second).unwrap().len(), 129 * 1024 * 1024);
}
