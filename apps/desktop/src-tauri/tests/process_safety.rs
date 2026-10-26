#![cfg(windows)]

use ningmao_desktop_lib::store::Store;
use std::{
    fs::{self, OpenOptions},
    os::windows::{fs::OpenOptionsExt, process::CommandExt},
    process::{Child, Command, Stdio},
    sync::atomic::AtomicBool,
    time::{Duration, Instant},
};

// Always reap only the child spawned by this test, including assertion/timeout failures.
struct Worker(Child);
impl Drop for Worker {
    fn drop(&mut self) {
        if self.0.try_wait().ok().flatten().is_none() {
            let _ = self.0.kill();
        }
        let _ = self.0.wait();
    }
}

#[test]
fn killed_copy_worker_retains_committed_data_and_unpublished_staging() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("source");
    let target = root.path().join("target");
    fs::create_dir(&source).unwrap();
    fs::create_dir(&target).unwrap();
    fs::write(source.join("已完成.txt"), b"completed-source-stays").unwrap();
    let bytes = vec![0x63; 8 * 1024 * 1024];
    fs::write(source.join("复制中 中文.bin"), &bytes).unwrap();

    // This is a Rust test worker, never the Tauri application's run() or a desktop app.
    // Explicit Windows flags also prevent a console window and reduce scheduling priority.
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x00004000;
    let child = Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "copy_worker_fixture",
            "--ignored",
            "--test-threads=1",
        ])
        .env("NINGMAO_CRASH_FIXTURE", root.path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS)
        .spawn()
        .unwrap();
    let mut worker = Worker(child);
    let ready = root.path().join("worker-ready");
    let started = Instant::now();
    while !ready.exists() {
        assert!(
            started.elapsed() < Duration::from_secs(15),
            "worker timeout"
        );
        assert!(
            worker.0.try_wait().unwrap().is_none(),
            "worker exited before reaching the copy barrier"
        );
        std::thread::sleep(Duration::from_millis(25));
    }
    worker.0.kill().unwrap();
    assert!(!worker.0.wait().unwrap().success());

    let mut store = Store::open(&root.path().join("workstation.sqlite3")).unwrap();
    let snapshot = store.snapshot().unwrap();
    assert_eq!(snapshot.jobs.len(), 1);
    assert_eq!(snapshot.jobs[0].status, "interrupted");
    let staging = std::path::Path::new(snapshot.jobs[0].staging.as_ref().unwrap());
    assert_eq!(
        staging.parent().unwrap(),
        fs::canonicalize(&target).unwrap()
    );
    let partial = fs::metadata(staging).unwrap().len();
    assert!(partial > 0 && partial < bytes.len() as u64);
    assert!(!target.join("复制中 中文.bin").exists());
    assert_eq!(
        fs::read(target.join("已完成.txt")).unwrap(),
        b"completed-source-stays"
    );
    let item = snapshot
        .items
        .iter()
        .find(|item| item.shelf_id == 1 && item.name == "复制中 中文.bin")
        .unwrap();
    assert_eq!(item.tags, ["崩溃后保留"]);
    assert!(snapshot.items.iter().any(|item| item.shelf_id == 2));
    assert_eq!(fs::read(source.join("复制中 中文.bin")).unwrap(), bytes);
    assert_eq!(
        fs::read(source.join("已完成.txt")).unwrap(),
        b"completed-source-stays"
    );
    store.integrity_check().unwrap();
    store.clean_exit().unwrap();
    assert!(
        store
            .snapshot()
            .unwrap()
            .items
            .iter()
            .all(|i| i.shelf_id != 2)
    );
    assert!(
        staging.exists(),
        "recovery/clean exit must not delete staging"
    );
}

#[test]
#[ignore = "parent process-safety test launches this worker with an isolated root"]
fn copy_worker_fixture() {
    let root = std::path::PathBuf::from(
        std::env::var_os("NINGMAO_CRASH_FIXTURE").expect("parent must supply fixture root"),
    );
    assert!(root.is_absolute());
    let source = root.join("source/复制中 中文.bin");
    let mut store = Store::open(&root.join("workstation.sqlite3")).unwrap();
    let id = store.add_reference(1, &source).unwrap();
    store.set_tags(id, vec!["崩溃后保留".into()]).unwrap();
    store.add_reference(2, &source).unwrap();
    let shelf = store.bind_directory(&root.join("target")).unwrap();
    store
        .copy_one(
            shelf,
            &root.join("source/已完成.txt"),
            &AtomicBool::new(false),
            |_, _| {},
        )
        .unwrap();
    let job = store
        .begin_job(shelf, "actual process termination")
        .unwrap();
    store
        .plan_copy(shelf, &source)
        .unwrap()
        .execute(
            &AtomicBool::new(false),
            |copied, total| {
                assert!(copied > 0 && copied < total);
                fs::write(root.join("worker-ready"), b"first chunk copied").unwrap();
                // The parent kills this process while production copy handles and SQLite
                // are live; no Store/NamedTempFile Drop simulates a clean shutdown.
                loop {
                    std::thread::park_timeout(Duration::from_secs(1));
                }
            },
            |path| store.stage_job(job, path),
        )
        .unwrap();
    panic!("copy barrier unexpectedly returned");
}

#[test]
fn windows_sharing_conflicts_fail_safely_and_copy_holds_source_and_root() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("locked.txt");
    let target = root.path().join("target");
    fs::create_dir(&target).unwrap();
    fs::write(&source, vec![0x42; 2 * 1024 * 1024]).unwrap();
    let mut store = Store::open(&root.path().join("data.sqlite3")).unwrap();
    let shelf = store.bind_directory(&target).unwrap();
    let plan = store.plan_copy(shelf, &source).unwrap();
    let exclusive = OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&source)
        .unwrap();
    let failure = plan.execute(&AtomicBool::new(false), |_, _| {}, |_| Ok(()));
    assert!(failure.unwrap_err().contains("os error 32"));
    assert_eq!(fs::read_dir(&target).unwrap().count(), 0);
    drop(exclusive);

    let mut checked = false;
    let copied = store
        .copy_one(shelf, &source, &AtomicBool::new(false), |_, _| {
            if !checked {
                assert!(OpenOptions::new().write(true).open(&source).is_err());
                assert!(fs::rename(&target, root.path().join("replaced-target")).is_err());
                checked = true;
            }
        })
        .unwrap();
    assert!(checked);
    assert_eq!(fs::read(&source).unwrap(), fs::read(copied).unwrap());
    assert!(OpenOptions::new().write(true).open(&source).is_ok());
    fs::rename(&target, root.path().join("released-target")).unwrap();
    store.integrity_check().unwrap();
}

#[test]
fn newer_or_invalid_database_is_rejected_without_rewriting_user_data() {
    let root = tempfile::tempdir().unwrap();
    let db = root.path().join("newer.sqlite3");
    {
        let mut store = Store::open(&db).unwrap();
        let file = root.path().join("keep.txt");
        fs::write(&file, b"keep").unwrap();
        store.add_reference(1, &file).unwrap();
    }
    {
        let connection = rusqlite::Connection::open(&db).unwrap();
        connection.execute_batch("PRAGMA user_version=99;").unwrap();
    }
    let original = fs::read(&db).unwrap();
    assert!(Store::open(&db).is_err());
    assert_eq!(fs::read(&db).unwrap(), original);
    let invalid = root.path().join("invalid.sqlite3");
    fs::write(
        &invalid,
        b"synthetic invalid database; preserve these bytes",
    )
    .unwrap();
    let original = fs::read(&invalid).unwrap();
    assert!(Store::open(&invalid).is_err());
    assert_eq!(fs::read(&invalid).unwrap(), original);
}

// ACL changes apply only to fresh fixture paths, never recursively or to a parent.
// Drop restores our explicit deny ACE if a copy/assertion fails before normal restoration.
struct DeniedAccess {
    path: std::path::PathBuf,
    active: bool,
}
impl DeniedAccess {
    fn command(path: &std::path::Path, arguments: &[&str]) -> bool {
        let program = std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap())
            .join("System32/icacls.exe");
        Command::new(program)
            .arg(path)
            .args(arguments)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(0x08000000 | 0x00004000)
            .status()
            .is_ok_and(|status| status.success())
    }
    fn new(path: &std::path::Path, rights: &str) -> Self {
        let guard = Self {
            path: path.to_owned(),
            active: true,
        };
        assert!(Self::command(path, &["/deny", rights, "/Q"]));
        guard
    }
    fn restore(&mut self) {
        assert!(Self::command(&self.path, &["/remove:d", "*S-1-1-0", "/Q"]));
        self.active = false;
    }
}
impl Drop for DeniedAccess {
    fn drop(&mut self) {
        if self.active {
            let _ = Self::command(&self.path, &["/remove:d", "*S-1-1-0", "/Q"]);
        }
    }
}

#[test]
fn windows_acl_read_and_create_denials_keep_original_bytes_and_allow_retry() {
    let root = tempfile::tempdir().unwrap();
    let source = root.path().join("权限 原件.txt");
    let target = root.path().join("target");
    fs::create_dir(&target).unwrap();
    fs::write(&source, b"preserve-source").unwrap();
    let existing = target.join("权限 原件.txt");
    fs::write(&existing, b"preserve-existing-target").unwrap();
    let mut store = Store::open(&root.path().join("data.sqlite3")).unwrap();
    let shelf = store.bind_directory(&target).unwrap();

    // Make the production plan first, then revoke read-data access before execute.
    let plan = store.plan_copy(shelf, &source).unwrap();
    let mut denied = DeniedAccess::new(&source, "*S-1-1-0:(RD)");
    assert_eq!(fs::File::open(&source).unwrap_err().raw_os_error(), Some(5));
    let failure = plan
        .execute(&AtomicBool::new(false), |_, _| {}, |_| Ok(()))
        .unwrap_err();
    assert!(failure.contains("os error 5"));
    denied.restore();
    assert_eq!(fs::read(&source).unwrap(), b"preserve-source");
    assert_eq!(fs::read_dir(&target).unwrap().count(), 1);

    // Deny FILE_ADD_FILE only, leaving traversal/reading and ACL restoration possible.
    let plan = store.plan_copy(shelf, &source).unwrap();
    let mut denied = DeniedAccess::new(&target, "*S-1-1-0:(WD)");
    let failure = plan
        .execute(&AtomicBool::new(false), |_, _| {}, |_| Ok(()))
        .unwrap_err();
    assert!(failure.contains("os error 5"));
    denied.restore();
    assert_eq!(fs::read_dir(&target).unwrap().count(), 1);
    assert_eq!(fs::read(&existing).unwrap(), b"preserve-existing-target");
    assert_eq!(fs::read(&source).unwrap(), b"preserve-source");
    let copied = store
        .copy_one(shelf, &source, &AtomicBool::new(false), |_, _| {})
        .unwrap();
    assert_eq!(copied.file_name().unwrap(), "权限 原件 (1).txt");
    assert_eq!(fs::read(copied).unwrap(), b"preserve-source");
    assert_eq!(fs::read(existing).unwrap(), b"preserve-existing-target");
    store.integrity_check().unwrap();
}

#[test]
fn windows_paths_over_260_utf16_units_copy_unicode_and_number_conflicts() {
    use std::os::windows::ffi::OsStrExt;
    let root = tempfile::tempdir().unwrap();
    let mut nested = root.path().to_path_buf();
    while nested.as_os_str().encode_wide().count() < 320 {
        nested.push("中文 空格 #+[] 😀");
    }
    let target = nested.join("用户绑定 (目标)");
    fs::create_dir_all(&target).unwrap();
    let source = nested.join("特殊 #+[] 😀.txt");
    fs::write(&source, b"long-unicode-source").unwrap();
    fs::write(target.join(source.file_name().unwrap()), b"existing-target").unwrap();
    assert!(source.as_os_str().encode_wide().count() > 260);
    assert!(target.as_os_str().encode_wide().count() > 260);
    let mut store = Store::open(&root.path().join("data.sqlite3")).unwrap();
    store.add_reference(1, &source).unwrap();
    let shelf = store.bind_directory(&target).unwrap();
    let copied = store
        .copy_one(shelf, &source, &AtomicBool::new(false), |_, _| {})
        .unwrap();
    assert_eq!(copied.file_name().unwrap(), "特殊 #+[] 😀 (1).txt");
    assert_eq!(fs::read(copied).unwrap(), b"long-unicode-source");
    assert_eq!(fs::read(&source).unwrap(), b"long-unicode-source");
    assert_eq!(
        fs::read(target.join(source.file_name().unwrap())).unwrap(),
        b"existing-target"
    );
    assert_eq!(store.snapshot().unwrap().items[0].status, "normal");
    store.integrity_check().unwrap();
}
