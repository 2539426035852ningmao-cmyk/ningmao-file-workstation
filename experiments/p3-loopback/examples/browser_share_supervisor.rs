#[path = "../../../apps/desktop/src-tauri/src/browser_share_process.rs"]
mod browser_share_process;
#[path = "../../../apps/desktop/src-tauri/src/browser_share_tasks.rs"]
mod browser_share_tasks;
#[allow(dead_code, unused_imports)]
#[path = "../../../apps/desktop/src-tauri/src/store.rs"]
mod store;
use std::{
    io::{BufRead, Write},
    sync::{Arc, Mutex},
};
#[derive(serde::Deserialize)]
struct Request {
    relay: String,
    password: String,
    code: String,
    paths: Vec<std::path::PathBuf>,
}
fn main() {
    if run().is_err() {
        std::process::exit(1);
    }
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = std::io::BufReader::new(std::io::stdin());
    let mut line = String::new();
    input.read_line(&mut line)?;
    let request: Request = serde_json::from_str(&line)?;
    let directory = tempfile::tempdir()?;
    let db = Arc::new(Mutex::new(store::Store::open(
        &directory.path().join("state.db"),
    )?));
    let control = Arc::new(browser_share_process::ShareControl::default());
    let session = control.begin()?;
    let cancelling = control.clone();
    let task_db = db.clone();
    std::thread::spawn(move || {
        let mut line = String::new();
        if input.read_line(&mut line).is_ok()
            && serde_json::from_str::<serde_json::Value>(&line).is_ok_and(|v| v["cancel"] == true)
        {
            let job = task_db.lock().unwrap().management_snapshot().unwrap().jobs[0].id;
            assert!(cancelling.cancel_job(job).unwrap());
        }
    });
    let ids = request
        .paths
        .iter()
        .map(|path| db.lock().unwrap().add_reference(2, path))
        .collect::<store::Result<Vec<_>>>()?;
    let expected = std::env::var("NINGMAO_GO_SENDER_SHA256")?;
    if expected.len() != 64 {
        return Err("sender hash required".into());
    }
    let mut sha256 = [0u8; 32];
    for (index, value) in sha256.iter_mut().enumerate() {
        *value = u8::from_str_radix(&expected[index * 2..index * 2 + 2], 16)?;
    }
    let program = browser_share_process::SenderProgram {
        path: std::env::var_os("NINGMAO_GO_SENDER_BINARY")
            .ok_or("sender required")?
            .into(),
        sha256,
    };
    let outcome = session.run_items(
        &db,
        2,
        &ids,
        &program,
        &browser_share_process::Connection {
            relay: request.relay,
            password: request.password,
            code: request.code,
        },
        |line| {
            assert!(control.prepare_exit().is_err());
            assert!(control.begin().is_err());
            let mut output = std::io::stdout();
            let _ = output.write_all(line);
            let _ = output.flush();
        },
    )?;
    control.prepare_exit()?;
    assert!(!control.cancel_job(outcome.job_id)?);
    assert_eq!(
        db.lock().unwrap().management_snapshot()?.jobs[0].status,
        outcome.status
    );
    if outcome.status != "completed" {
        return Err("share did not complete".into());
    }
    Ok(())
}
