#[path = "../../../apps/desktop/src-tauri/src/browser_share_tasks.rs"]
mod browser_share_tasks;
#[allow(dead_code, unused_imports)]
#[path = "../../../apps/desktop/src-tauri/src/store.rs"]
mod store;
use browser_share_tasks::BrowserShareTask;

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
