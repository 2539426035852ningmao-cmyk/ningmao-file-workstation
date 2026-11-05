#[path = "../../../apps/desktop/src-tauri/src/browser_share_tasks.rs"]
mod browser_share_tasks;
#[allow(dead_code, unused_imports)]
#[path = "../../../apps/desktop/src-tauri/src/store.rs"]
mod store;
use browser_share_tasks::BrowserShareTask;
#[path = "../../../apps/desktop/src-tauri/src/browser_share_process.rs"]
mod browser_share_process;

#[test]
fn share_control_owns_one_session_and_releases_failed_preparation() {
    let control = browser_share_process::ShareControl::default();
    assert!(control.prepare_exit().is_ok());
    let session = control.begin().unwrap();
    assert!(control.begin().is_err());
    assert!(control.prepare_exit().is_err());
    assert!(!control.cancel_job(42).unwrap());
    let dir = tempfile::tempdir().unwrap();
    let db = std::sync::Mutex::new(store::Store::open(&dir.path().join("state.db")).unwrap());
    let result = session.run(
        &db,
        2,
        &browser_share_process::SenderProgram {
            path: std::env::current_exe().unwrap(),
            sha256: [0; 32],
        },
        &browser_share_process::Connection {
            relay: "127.0.0.1:1".into(),
            password: "synthetic".into(),
            code: "acid-acorn-acre".into(),
        },
        &mut [],
        |_| panic!("must not launch"),
    );
    assert_eq!(result.err().unwrap(), "分享组件校验失败");
    assert!(control.prepare_exit().is_ok());
    assert!(control.begin().is_ok());
}

#[test]
fn untrusted_sender_binary_is_rejected_without_creating_a_job() {
    let dir = tempfile::tempdir().unwrap();
    let db = std::sync::Mutex::new(store::Store::open(&dir.path().join("state.db")).unwrap());
    let result = browser_share_process::run(
        &db,
        2,
        &browser_share_process::SenderProgram {
            path: std::env::current_exe().unwrap(),
            sha256: [0; 32],
        },
        &browser_share_process::Connection {
            relay: "127.0.0.1:1".into(),
            password: "synthetic".into(),
            code: "acid-acorn-acre".into(),
        },
        &mut [],
        &std::sync::atomic::AtomicBool::new(false),
        |_, _| panic!("untrusted executable must not emit events"),
    );
    assert_eq!(result.err().unwrap(), "分享组件校验失败");
    assert!(
        db.lock()
            .unwrap()
            .management_snapshot()
            .unwrap()
            .jobs
            .is_empty()
    );
}

#[test]
fn item_share_rejects_other_shelf_before_starting_sender_and_releases_session() {
    let dir = tempfile::tempdir().unwrap();
    let source = dir.path().join("synthetic.txt");
    std::fs::write(&source, b"source retained").unwrap();
    let mut db = store::Store::open(&dir.path().join("state.db")).unwrap();
    let id = db.add_reference(2, &source).unwrap();
    let db = std::sync::Mutex::new(db);
    let control = browser_share_process::ShareControl::default();
    let program = browser_share_process::SenderProgram {
        path: dir.path().join("missing.exe"),
        sha256: [0; 32],
    };
    let connection = browser_share_process::Connection {
        relay: "127.0.0.1:1".into(),
        password: "synthetic".into(),
        code: "acid-acorn-acre".into(),
    };
    assert!(
        control
            .begin()
            .unwrap()
            .run_items(&db, 1, &[id], &program, &connection, |_| panic!(
                "must not start"
            ))
            .err()
            .unwrap()
            .contains("自己的文件架")
    );
    assert!(control.prepare_exit().is_ok());
    assert!(
        db.lock()
            .unwrap()
            .management_snapshot()
            .unwrap()
            .jobs
            .is_empty()
    );
    assert_eq!(std::fs::read(source).unwrap(), b"source retained");
}

#[test]
fn process_exit_cannot_report_success_or_change_a_terminal() {
    let dir = tempfile::tempdir().unwrap();
    let mut db = store::Store::open(&dir.path().join("state.db")).unwrap();
    let mut task = BrowserShareTask::default();
    let queued = br#"{"version":1,"phase":"queued","files":1,"total":10}"#;
    let verified = br#"{"version":1,"phase":"verified","files":1,"total":10}"#;
    assert!(task.accept(&mut db, 2, verified).is_err());
    task.accept(&mut db, 2, queued).unwrap();
    assert!(task.accept(&mut db, 2, verified).is_err());
    task.exited(&mut db).unwrap();
    assert_eq!(db.management_snapshot().unwrap().jobs[0].status, "failed");
    assert!(task.accept(&mut db, 2, verified).is_err());
}

#[test]
fn share_terminals_survive_exit_replay_and_database_reopen() {
    for (phase, expected) in [
        ("verified", "completed"),
        ("failed", "failed"),
        ("cancelled", "cancelled"),
    ] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.db");
        let mut db = store::Store::open(&path).unwrap();
        let mut task = BrowserShareTask::default();
        let event = |phase: &str| {
            serde_json::to_vec(&serde_json::json!({"version":1,"phase":phase,"files":1,"total":10}))
                .unwrap()
        };
        let job = task.accept(&mut db, 2, &event("queued")).unwrap();
        assert!(task.accept(&mut db, 1, &event("waiting")).is_err());
        assert!(
            task.accept(
                &mut db,
                2,
                br#"{"version":1,"phase":"waiting","files":1,"total":11}"#
            )
            .is_err()
        );
        assert_eq!(db.management_snapshot().unwrap().jobs[0].status, "queued");
        task.accept(&mut db, 2, &event("waiting")).unwrap();
        task.accept(&mut db, 2, &event(phase)).unwrap();
        assert!(task.accept(&mut db, 2, &event(phase)).is_err());
        assert!(task.accept(&mut db, 2, &event("failed")).is_err());
        task.exited(&mut db).unwrap();
        drop(db);
        let db = store::Store::open(&path).unwrap();
        let jobs = db.management_snapshot().unwrap().jobs;
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].id, job);
        assert_eq!(jobs[0].status, expected);
    }
}

#[test]
#[ignore = "Requires event journal produced by the real sender/browser E2E"]
fn real_browser_verified_events_persist_in_existing_store() {
    for (variable, terminal) in [
        ("NINGMAO_BROWSER_EVENTS", "completed"),
        ("NINGMAO_BROWSER_CANCEL_EVENTS", "cancelled"),
    ] {
        let journal = std::fs::read_to_string(std::env::var(variable).unwrap()).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("state.db");
        let mut db = store::Store::open(&path).unwrap();
        let mut task = BrowserShareTask::default();
        let lines: Vec<_> = journal.lines().collect();
        assert_eq!(lines.len(), 3);
        for (index, line) in lines.iter().enumerate() {
            task.accept(&mut db, 2, line.as_bytes()).unwrap();
            assert_eq!(
                db.management_snapshot().unwrap().jobs[0].status,
                ["queued", "copying", terminal][index]
            );
        }
        task.exited(&mut db).unwrap();
        drop(db);
        let db = store::Store::open(&path).unwrap();
        let snapshot = db.management_snapshot().unwrap();
        assert_eq!(snapshot.jobs.len(), 1);
        assert_eq!(snapshot.jobs[0].status, terminal);
        if terminal == "completed" {
            assert!(snapshot.jobs[0].message.contains("对方已确认内容校验"));
        }
        assert!(!snapshot.jobs[0].message.contains("acid"));
    }
}
