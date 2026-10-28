#[allow(dead_code)]
#[path = "../../../apps/desktop/src-tauri/src/store.rs"]
mod store;
#[path = "../../../apps/desktop/src-tauri/src/transfer_tasks.rs"]
mod transfer_tasks;
use ningmao_transfer_contract::{Phase, TaskEvent};
use transfer_tasks::TransferTasks;

fn event(sequence: u64, phase: Phase, bytes: u64) -> TaskEvent {
    TaskEvent {
        version: 1,
        task: "00000000-0000-4000-8000-000000000001".into(),
        sequence,
        phase,
        files: 1,
        completed: u32::from(phase == Phase::Completed),
        bytes,
        total: 100,
    }
}

#[test]
fn cancellation_waits_for_cleanup_and_cannot_overwrite_terminal() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = store::Store::open(&dir.path().join("state.db")).unwrap();
    let mut adapter = TransferTasks::default();
    let id = adapter
        .apply(&mut store, 2, &event(1, Phase::Queued, 0))
        .unwrap()
        .unwrap();
    adapter
        .apply(&mut store, 2, &event(2, Phase::Receiving, 50))
        .unwrap();
    adapter
        .apply(&mut store, 2, &event(3, Phase::Cancelling, 50))
        .unwrap();
    let job = store.snapshot().unwrap().jobs.remove(0);
    assert_eq!(job.id, id);
    assert_eq!(job.status, "copying");
    assert!(job.message.contains("等待安全清理"));
    assert!(
        adapter
            .apply(&mut store, 1, &event(4, Phase::Cancelled, 50))
            .is_err()
    );
    adapter
        .apply(&mut store, 2, &event(4, Phase::Cancelled, 50))
        .unwrap();
    assert!(
        adapter
            .apply(&mut store, 2, &event(5, Phase::Completed, 100))
            .is_err()
    );
    assert_eq!(store.snapshot().unwrap().jobs[0].status, "cancelled");
}

#[test]
fn invalid_or_replayed_events_do_not_write_and_restart_does_not_resume() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("state.db");
    let mut store = store::Store::open(&path).unwrap();
    let mut adapter = TransferTasks::default();
    assert!(
        adapter
            .apply(&mut store, 2, &event(2, Phase::Completed, 100))
            .is_err()
    );
    let mut bad = event(1, Phase::Queued, 0);
    bad.version = 2;
    assert!(adapter.apply(&mut store, 2, &bad).is_err());
    assert!(store.snapshot().unwrap().jobs.is_empty());
    adapter
        .apply(&mut store, 2, &event(1, Phase::Queued, 0))
        .unwrap();
    assert!(
        adapter
            .apply(&mut store, 2, &event(1, Phase::Queued, 0))
            .unwrap()
            .is_none()
    );
    bad = event(2, Phase::Receiving, 101);
    assert!(adapter.apply(&mut store, 2, &bad).is_err());
    adapter
        .apply(&mut store, 2, &event(2, Phase::Receiving, 40))
        .unwrap();
    assert!(
        adapter
            .apply(&mut store, 2, &event(3, Phase::Receiving, 30))
            .is_err()
    );
    drop(store);
    let mut reopened = store::Store::open(&path).unwrap();
    assert_eq!(reopened.snapshot().unwrap().jobs[0].status, "interrupted");
    let db = rusqlite::Connection::open(&path).unwrap();
    assert_eq!(
        db.pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        2
    );
}

#[test]
fn conflicting_duplicate_and_forged_early_terminal_are_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = store::Store::open(&dir.path().join("state.db")).unwrap();
    let mut adapter = TransferTasks::default();
    adapter
        .apply(&mut store, 2, &event(1, Phase::Queued, 0))
        .unwrap();
    assert!(
        adapter
            .apply(&mut store, 2, &event(1, Phase::Completed, 100))
            .is_err()
    );
    assert!(
        adapter
            .apply(&mut store, 2, &event(2, Phase::Completed, 100))
            .is_err()
    );
    assert_eq!(store.snapshot().unwrap().jobs[0].status, "queued");
}

#[test]
fn real_worker_events_reach_existing_store_without_schema_or_file_changes() {
    use std::{
        collections::{HashMap, HashSet},
        fs,
        io::Read,
        process::{Command, Stdio},
        time::{Duration, Instant},
    };
    struct Worker(std::process::Child);
    impl Drop for Worker {
        fn drop(&mut self) {
            if self.0.try_wait().ok().flatten().is_none() {
                let _ = self.0.kill();
            }
            let _ = self.0.wait();
        }
    }
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("synthetic-probe");
    let dbpath = dir.path().join("state.db");
    let protected = dir.path().join("protected.txt");
    fs::write(&protected, b"protected synthetic reference").unwrap();
    let mut store = store::Store::open(&dbpath).unwrap();
    let reference = store.add_reference(2, &protected).unwrap();
    store.set_tags(reference, vec!["keep".into()]).unwrap();
    let mut command = Command::new(env!("CARGO_BIN_EXE_ningmao-loopback-probe"));
    command
        .args(["probe"])
        .arg(&root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::from(
            fs::File::create(dir.path().join("worker.log")).unwrap(),
        ));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut worker = Worker(command.spawn().unwrap());
    let started = Instant::now();
    let mut file = None;
    let mut pending = Vec::new();
    let mut runtime = transfer_runtime::TransferRuntime::default();
    let mut events: HashMap<String, Vec<TaskEvent>> = HashMap::new();
    let mut exit = None;
    loop {
        assert!(
            started.elapsed() < Duration::from_secs(120),
            "controlled worker deadline"
        );
        if file.is_none() {
            file = fs::File::open(root.join("task-events.jsonl")).ok();
        }
        if let Some(file) = file.as_mut() {
            file.read_to_end(&mut pending).unwrap();
        }
        assert!(pending.len() <= 256 * 1024, "bounded task journal read");
        while let Some(end) = pending.iter().position(|b| *b == b'\n') {
            let line: Vec<_> = pending.drain(..=end).collect();
            assert!(line.len() <= 1024);
            let event: TaskEvent = serde_json::from_slice(&line).unwrap();
            let progress = runtime.accept(&mut store, 2, &line).unwrap().unwrap();
            let id = progress.job_id;
            assert_eq!(progress.phase, event.phase);
            let jobs = store.management_snapshot().unwrap().jobs;
            let job = jobs.iter().find(|j| j.id == id).unwrap();
            if event.phase == Phase::Cancelling {
                assert_eq!(job.status, "copying");
                assert!(job.message.contains("等待安全清理"));
            }
            if event.phase == Phase::Verifying {
                assert_eq!(job.status, "copying");
            }
            if event.phase.terminal() {
                assert!(!["queued", "copying"].contains(&job.status.as_str()));
            }
            assert!(job.staging.is_none());
            events.entry(event.task.clone()).or_default().push(event);
        }
        if exit.is_some() {
            break;
        }
        exit = worker.0.try_wait().unwrap();
        std::thread::sleep(Duration::from_millis(5));
    }
    assert!(
        exit.unwrap().success(),
        "probe failed; local worker diagnostics retained until assertion"
    );
    assert!(pending.is_empty());
    runtime
        .worker_exited(&mut store, exit.unwrap().success(), true)
        .unwrap();
    let report: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join("sender-result.json")).unwrap()).unwrap();
    assert_eq!(report["status"], "SUCCESS");
    assert_eq!(report["stagingCleaned"], true);
    let mut terminals = HashSet::new();
    let mut progress = false;
    let mut waiting = false;
    for history in events.values() {
        let last = history.last().unwrap();
        assert!(last.phase.terminal());
        terminals.insert(format!("{:?}", last.phase));
        assert_eq!(history.iter().filter(|e| e.phase.terminal()).count(), 1);
        assert!(
            history
                .windows(2)
                .all(|p| p[1].sequence == p[0].sequence + 1)
        );
        progress |= history
            .iter()
            .any(|e| e.phase == Phase::Receiving && e.bytes > 0 && e.bytes < e.total);
        waiting |= history
            .iter()
            .any(|e| e.phase == Phase::Cancelling && e.bytes > 0);
        let mut late = last.clone();
        late.sequence += 1;
        late.phase = Phase::Receiving;
        assert!(
            runtime
                .accept(&mut store, 2, &serde_json::to_vec(&late).unwrap())
                .is_err()
        );
    }
    for phase in ["Completed", "Partial", "Failed", "Cancelled"] {
        assert!(terminals.contains(phase), "missing {phase}");
    }
    assert!(progress && waiting);
    let before = serde_json::to_value(store.management_snapshot().unwrap()).unwrap();
    assert_eq!(before["items"][0]["id"], reference);
    assert_eq!(before["items"][0]["tags"][0], "keep");
    drop(store);
    let reopened = store::Store::open(&dbpath).unwrap();
    assert_eq!(
        serde_json::to_value(reopened.management_snapshot().unwrap()).unwrap(),
        before
    );
    assert_eq!(
        fs::read(protected).unwrap(),
        b"protected synthetic reference"
    );
    let db = rusqlite::Connection::open(&dbpath).unwrap();
    assert_eq!(
        db.pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        2
    );
    assert_eq!(
        db.pragma_query_value::<String, _>(None, "integrity_check", |r| r.get(0))
            .unwrap(),
        "ok"
    );
    println!(
        "real_worker_task_store=SUCCESS tasks={} progress=true cancel_wait=true schema=2 integrity=ok",
        events.len()
    );
}

#[test]
fn runtime_marks_unfinished_worker_interrupted_and_never_assumes_success() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = store::Store::open(&dir.path().join("db.sqlite3")).unwrap();
    let mut runtime = transfer_runtime::TransferRuntime::default();
    let queued = serde_json::to_vec(&event(1, Phase::Queued, 0)).unwrap();
    let id = runtime
        .accept(&mut store, 2, &queued)
        .unwrap()
        .unwrap()
        .job_id;
    runtime
        .accept(
            &mut store,
            2,
            &serde_json::to_vec(&event(2, Phase::Receiving, 50)).unwrap(),
        )
        .unwrap();
    assert!(runtime.worker_exited(&mut store, true, true).is_err());
    let job = store
        .management_snapshot()
        .unwrap()
        .jobs
        .into_iter()
        .find(|j| j.id == id)
        .unwrap();
    assert_eq!(job.status, "interrupted");
    assert!(!job.message.contains("接收完成"));
    assert!(runtime.worker_exited(&mut store, true, true).is_err());
    assert!(runtime.accept(&mut store, 2, &queued).is_err());
}

#[test]
fn runtime_reports_failed_persistence_and_preserves_previous_job_state() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("db.sqlite3");
    let mut store = store::Store::open(&path).unwrap();
    let mut runtime = transfer_runtime::TransferRuntime::default();
    let id = runtime
        .accept(
            &mut store,
            2,
            &serde_json::to_vec(&event(1, Phase::Queued, 0)).unwrap(),
        )
        .unwrap()
        .unwrap()
        .job_id;
    runtime
        .accept(
            &mut store,
            2,
            &serde_json::to_vec(&event(2, Phase::Receiving, 100)).unwrap(),
        )
        .unwrap();
    runtime
        .accept(
            &mut store,
            2,
            &serde_json::to_vec(&event(3, Phase::Verifying, 100)).unwrap(),
        )
        .unwrap();
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch("CREATE TRIGGER fail_terminal BEFORE UPDATE OF status ON jobs WHEN NEW.status='completed' BEGIN SELECT RAISE(FAIL, 'synthetic'); END;").unwrap();
    assert!(
        runtime
            .accept(
                &mut store,
                2,
                &serde_json::to_vec(&event(4, Phase::Completed, 100)).unwrap()
            )
            .is_err()
    );
    let job = store
        .management_snapshot()
        .unwrap()
        .jobs
        .into_iter()
        .find(|j| j.id == id)
        .unwrap();
    assert_eq!(job.status, "copying");
    assert!(runtime.worker_exited(&mut store, true, true).is_err());
    assert_eq!(
        store
            .management_snapshot()
            .unwrap()
            .jobs
            .into_iter()
            .find(|j| j.id == id)
            .unwrap()
            .status,
        "interrupted"
    );
}
#[path = "../../../apps/desktop/src-tauri/src/transfer_runtime.rs"]
mod transfer_runtime;

#[test]
fn runtime_does_not_report_success_for_a_missing_job_record() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("db.sqlite3");
    let mut store = store::Store::open(&path).unwrap();
    let mut runtime = transfer_runtime::TransferRuntime::default();
    let id = runtime
        .accept(
            &mut store,
            2,
            &serde_json::to_vec(&event(1, Phase::Queued, 0)).unwrap(),
        )
        .unwrap()
        .unwrap()
        .job_id;
    runtime
        .accept(
            &mut store,
            2,
            &serde_json::to_vec(&event(2, Phase::Receiving, 100)).unwrap(),
        )
        .unwrap();
    runtime
        .accept(
            &mut store,
            2,
            &serde_json::to_vec(&event(3, Phase::Verifying, 100)).unwrap(),
        )
        .unwrap();
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute("DELETE FROM jobs WHERE id=?1", [id]).unwrap();
    assert!(
        runtime
            .accept(
                &mut store,
                2,
                &serde_json::to_vec(&event(4, Phase::Completed, 100)).unwrap()
            )
            .is_err()
    );
    assert!(runtime.worker_exited(&mut store, true, true).is_err());
}

#[test]
fn runtime_never_overwrites_a_terminal_job_changed_elsewhere() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("db.sqlite3");
    let mut store = store::Store::open(&path).unwrap();
    let mut runtime = transfer_runtime::TransferRuntime::default();
    let id = runtime
        .accept(
            &mut store,
            2,
            &serde_json::to_vec(&event(1, Phase::Queued, 0)).unwrap(),
        )
        .unwrap()
        .unwrap()
        .job_id;
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute(
        "UPDATE jobs SET status='cancelled',message='settled' WHERE id=?1",
        [id],
    )
    .unwrap();
    assert!(
        runtime
            .accept(
                &mut store,
                2,
                &serde_json::to_vec(&event(2, Phase::Receiving, 50)).unwrap()
            )
            .is_err()
    );
    assert!(runtime.worker_exited(&mut store, true, true).is_err());
    let job = store
        .management_snapshot()
        .unwrap()
        .jobs
        .into_iter()
        .find(|j| j.id == id)
        .unwrap();
    assert_eq!(
        (job.status.as_str(), job.message.as_str()),
        ("cancelled", "settled")
    );
}
