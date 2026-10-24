use ningmao_desktop_lib::store::Store;
use std::{fs, sync::atomic::AtomicBool};

#[test]
fn references_survive_restart_and_missing_source_without_deleting_bytes() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("中文 原件.txt");
    fs::write(&source, b"source-stays").unwrap();
    let db = root.path().join("shelves.sqlite3");
    let id;
    {
        let mut store = Store::open(&db).unwrap();
        id = store.add_reference(1, &source).unwrap();
        store.set_tags(id, vec!["精选".into()]).unwrap();
        assert_eq!(store.snapshot().unwrap().items.len(), 1);
    }
    let mut store = Store::open(&db).unwrap();
    assert_eq!(store.snapshot().unwrap().items[0].tags, ["精选"]);
    fs::rename(&source, root.path().join("moved.txt")).unwrap();
    let snapshot = store.snapshot().unwrap();
    assert_eq!(snapshot.items[0].status, "missing");
    assert_eq!(snapshot.items[0].tags, ["精选"]);
    store.remove_reference(id).unwrap();
    assert_eq!(
        fs::read(root.path().join("moved.txt")).unwrap(),
        b"source-stays"
    );
    store.integrity_check().unwrap();
}

#[test]
fn copy_collision_cancel_and_failure_keep_sources_and_existing_targets() {
    let root = tempfile::tempdir().unwrap();
    let target = root.path().join("bound");
    fs::create_dir(&target).unwrap();
    let source = root.path().join("中文 空格.txt");
    fs::write(&source, vec![42; 2_000_000]).unwrap();
    fs::write(target.join("中文 空格.txt"), b"keep-original-target").unwrap();
    let mut store = Store::open(&root.path().join("data.sqlite3")).unwrap();
    let shelf = store.bind_directory(&target).unwrap();
    let cancel = AtomicBool::new(false);
    let result = store.copy_one(shelf, &source, &cancel, |_, _| {}).unwrap();
    assert_eq!(result.file_name().unwrap(), "中文 空格 (1).txt");
    assert_eq!(fs::read(&source).unwrap(), fs::read(&result).unwrap());
    assert_eq!(
        fs::read(target.join("中文 空格.txt")).unwrap(),
        b"keep-original-target"
    );
    let cancelled = AtomicBool::new(false);
    let result = store.copy_one(shelf, &source, &cancelled, |done, _| {
        if done > 0 {
            cancelled.store(true, std::sync::atomic::Ordering::SeqCst);
        }
    });
    assert!(result.is_err());
    assert!(!target.join("中文 空格 (2).txt").exists());
    assert!(fs::read_dir(&target).unwrap().all(|entry| {
        !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".ningmao-copy-")
    }));
    assert!(
        store
            .copy_one(shelf, &root.path().join("missing.txt"), &cancel, |_, _| {})
            .is_err()
    );
    assert_eq!(fs::read(&source).unwrap(), vec![42; 2_000_000]);
    store.integrity_check().unwrap();
}

#[test]
fn interrupted_jobs_are_retained_and_session_only_clears_on_clean_exit() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("data.sqlite3");
    let file = root.path().join("session.txt");
    fs::write(&file, b"keep").unwrap();
    {
        let mut store = Store::open(&path).unwrap();
        store.add_reference(2, &file).unwrap();
        store.begin_job(1, "模拟异常退出").unwrap();
    }
    let mut store = Store::open(&path).unwrap();
    assert_eq!(store.snapshot().unwrap().items.len(), 1);
    assert_eq!(store.snapshot().unwrap().jobs[0].status, "interrupted");
    store.clean_exit().unwrap();
    assert!(store.snapshot().unwrap().items.is_empty());
    assert_eq!(fs::read(file).unwrap(), b"keep");
}

#[test]
fn concurrent_publication_and_directory_name_collision_never_overwrite() {
    let root = tempfile::tempdir().unwrap();
    let target = root.path().join("target");
    fs::create_dir(&target).unwrap();
    let source = root.path().join("same.txt");
    fs::write(&source, vec![7; 128_000]).unwrap();
    fs::create_dir(target.join("same.txt")).unwrap();
    let mut store = Store::open(&root.path().join("data.sqlite3")).unwrap();
    let shelf = store.bind_directory(&target).unwrap();
    let a = store.plan_copy(shelf, &source).unwrap();
    let b = store.plan_copy(shelf, &source).unwrap();
    let a = std::thread::spawn(move || a.execute(&AtomicBool::new(false), |_, _| {}, |_| Ok(())));
    let b = std::thread::spawn(move || b.execute(&AtomicBool::new(false), |_, _| {}, |_| Ok(())));
    let a = a.join().unwrap().unwrap();
    let b = b.join().unwrap().unwrap();
    assert_ne!(a, b);
    assert_eq!(fs::read(a).unwrap(), vec![7; 128_000]);
    assert_eq!(fs::read(b).unwrap(), vec![7; 128_000]);
    assert!(target.join("same.txt").is_dir());
}

#[test]
fn failed_journal_cleanup_offline_binding_and_reorder_are_safe() {
    let root = tempfile::tempdir().unwrap();
    let bound = root.path().join("bound");
    fs::create_dir(&bound).unwrap();
    let source = root.path().join("data.bin");
    fs::write(&source, b"unchanged").unwrap();
    let db = root.path().join("data.sqlite3");
    let mut store = Store::open(&db).unwrap();
    let id = store.add_reference(1, &source).unwrap();
    assert!(store.reorder(1, &[id, id]).is_err());
    assert_eq!(store.snapshot().unwrap().items[0].id, id);
    let shelf = store.bind_directory(&bound).unwrap();
    let plan = store.plan_copy(shelf, &source).unwrap();
    assert!(
        plan.execute(
            &AtomicBool::new(false),
            |_, _| {},
            |_| Err("模拟任务记录写入失败".into())
        )
        .is_err()
    );
    assert_eq!(fs::read_dir(&bound).unwrap().count(), 0);
    fs::rename(&bound, root.path().join("offline")).unwrap();
    assert!(
        !store
            .snapshot()
            .unwrap()
            .shelves
            .into_iter()
            .find(|s| s.id == shelf)
            .unwrap()
            .available
    );
    assert!(store.plan_copy(shelf, &source).is_err());
    assert!(store.item_path(99999).is_err());
    assert_eq!(fs::read(&source).unwrap(), b"unchanged");
}

#[test]
fn thumbnails_are_bounded_and_real_png_is_decoded() {
    let root = tempfile::tempdir().unwrap();
    let png = root.path().join("真实 缩略图.png");
    image::RgbImage::from_pixel(640, 480, image::Rgb([30, 90, 180]))
        .save(&png)
        .unwrap();
    let thumbnail = ningmao_desktop_lib::store::thumbnail(&png)
        .unwrap()
        .unwrap();
    assert!(thumbnail.starts_with("data:image/png;base64,"));
    let corrupt = root.path().join("corrupt.png");
    fs::write(&corrupt, b"not-png").unwrap();
    assert!(ningmao_desktop_lib::store::thumbnail(&corrupt).is_err());
    let oversized = root.path().join("too-big.png");
    fs::File::create(&oversized)
        .unwrap()
        .set_len(25 * 1024 * 1024)
        .unwrap();
    assert!(ningmao_desktop_lib::store::thumbnail(&oversized).is_err());
}

#[test]
fn long_unicode_path_and_crash_staging_are_retained() {
    let root = tempfile::tempdir().unwrap();
    let mut nested = root.path().to_path_buf();
    for _ in 0..14 {
        nested = nested.join("长中文目录 空格");
    }
    fs::create_dir_all(&nested).unwrap();
    let source = nested.join("特殊 #+[] 文件.txt");
    fs::write(&source, b"long-path").unwrap();
    let db = root.path().join("data.sqlite3");
    let stage = root.path().join(".ningmao-copy-interrupted");
    fs::write(&stage, b"partial-own-temp").unwrap();
    {
        let mut store = Store::open(&db).unwrap();
        store.add_reference(1, &source).unwrap();
        let job = store.begin_job(1, "copy").unwrap();
        store.stage_job(job, &stage).unwrap();
    }
    let mut store = Store::open(&db).unwrap();
    let snapshot = store.snapshot().unwrap();
    assert_eq!(snapshot.items[0].status, "normal");
    assert_eq!(snapshot.jobs[0].status, "interrupted");
    assert!(stage.exists());
    assert_eq!(fs::read(source).unwrap(), b"long-path");
}
