#[path = "../../../apps/desktop/src-tauri/src/browser_share_process.rs"]
mod browser_share_process;
#[path = "../../../apps/desktop/src-tauri/src/browser_share_tasks.rs"]
mod browser_share_tasks;
#[allow(dead_code, unused_imports)]
#[path = "../../../apps/desktop/src-tauri/src/store.rs"]
mod store;
use std::{
    io::{BufRead, Write},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
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
    let cancel = Arc::new(AtomicBool::new(false));
    let flag = cancel.clone();
    std::thread::spawn(move || {
        let mut line = String::new();
        if input.read_line(&mut line).is_ok()
            && serde_json::from_str::<serde_json::Value>(&line).is_ok_and(|v| v["cancel"] == true)
        {
            flag.store(true, Ordering::Release);
        }
    });
    let directory = tempfile::tempdir()?;
    let db = Mutex::new(store::Store::open(&directory.path().join("state.db"))?);
    let mut files: Vec<_> = request
        .paths
        .iter()
        .map(std::fs::File::open)
        .collect::<std::io::Result<_>>()?;
    let names: Vec<_> = request
        .paths
        .iter()
        .map(|p| p.file_name().unwrap().to_str().unwrap().to_owned())
        .collect();
    let mut sources: Vec<_> = names
        .iter()
        .zip(files.iter_mut())
        .map(|(name, file)| browser_share_process::Source { name, file })
        .collect();
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
    let outcome = browser_share_process::run(
        &db,
        2,
        &program,
        &browser_share_process::Connection {
            relay: request.relay,
            password: request.password,
            code: request.code,
        },
        &mut sources,
        &cancel,
        |line| {
            let mut output = std::io::stdout();
            let _ = output.write_all(line);
            let _ = output.flush();
        },
    )?;
    assert_eq!(
        db.lock().unwrap().management_snapshot()?.jobs[0].status,
        outcome.status
    );
    if outcome.status != "completed" {
        return Err("share did not complete".into());
    }
    Ok(())
}
