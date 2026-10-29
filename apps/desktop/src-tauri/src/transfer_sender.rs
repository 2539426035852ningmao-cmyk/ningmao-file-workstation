//! Trusted localhost sender. The caller authorizes the shelf and opens the source file first.
pub use crate::loopback_transport::LoopbackClient as LocalhostTransferClient;
use crate::store::{Result, Store};
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    sync::Mutex,
};

const MAX_FILE: u64 = 512 * 1024 * 1024;

/// Send one already-open regular file to an explicitly configured localhost receiver.
/// The existing Store owns the visible task lifecycle; no path, listener, or credential is
/// accepted from the WebView.
pub fn send_open_file(
    store: &Mutex<Store>,
    shelf: i64,
    client: &LocalhostTransferClient,
    source: &mut File,
    name: &str,
) -> Result<i64> {
    if name.is_empty()
        || name.len() > 240
        || name.contains(['/', '\\'])
        || name.chars().any(char::is_control)
    {
        return Err("文件名不可用于传输。".into());
    }
    let metadata = source
        .metadata()
        .map_err(|_| "无法读取所选文件。".to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_FILE {
        return Err("仅支持不超过 512 MiB 的普通文件。".into());
    }
    source
        .seek(SeekFrom::Start(0))
        .map_err(|_| "无法读取所选文件。".to_string())?;
    let mut digest = Sha256::new();
    let mut count = 0u64;
    let mut buffer = [0; 64 * 1024];
    loop {
        let read = source
            .read(&mut buffer)
            .map_err(|_| "无法读取所选文件。".to_string())?;
        if read == 0 {
            break;
        }
        count += read as u64;
        if count > MAX_FILE {
            return Err("所选文件大小已变化，请重试。".into());
        }
        digest.update(&buffer[..read]);
    }
    if count != metadata.len() {
        return Err("所选文件大小已变化，请重试。".into());
    }
    source
        .seek(SeekFrom::Start(0))
        .map_err(|_| "无法读取所选文件。".to_string())?;

    let job = store
        .lock()
        .map_err(|_| "任务存储不可用。".to_string())?
        .begin_job(shelf, "发送文件：等待对方确认")?;
    let outcome = (|| -> Result<()> {
        let files = serde_json::json!({
            "f": {
                "fileName": name,
                "size": count,
                "sha256": format!("{:x}", digest.finalize()),
            }
        });
        let (status, plan) = client
            .prepare(files)
            .map_err(|_| "连接失败，请重试。".to_string())?;
        if status != 200 {
            return Err("对方未接受文件。".into());
        }
        let session = plan["sessionId"]
            .as_str()
            .ok_or_else(|| "传输准备响应无效。".to_string())?;
        let token = plan["files"]["f"]
            .as_str()
            .ok_or_else(|| "传输准备响应无效。".to_string())?;
        finish_job(
            store,
            job,
            shelf,
            "copying",
            &format!("发送中 · 0/1 项 · 0/{count} B"),
        )?;
        let (status, _) = client
            .upload(session, "f", token, count, source)
            .map_err(|_| "传输中断，来源文件保留。".to_string())?;
        if status != 200 {
            return Err("文件未完成接收，来源文件保留。".into());
        }
        Ok(())
    })();

    match outcome {
        Ok(()) => {
            finish_job(
                store,
                job,
                shelf,
                "completed",
                &format!("发送完成 · 1/1 项 · {count}/{count} B"),
            )?;
            Ok(job)
        }
        Err(reason) => {
            finish_job(store, job, shelf, "failed", "发送失败，来源文件保留。")?;
            Err(reason)
        }
    }
}

fn finish_job(
    store: &Mutex<Store>,
    job: i64,
    shelf: i64,
    status: &str,
    message: &str,
) -> Result<()> {
    store
        .lock()
        .map_err(|_| "任务存储不可用。".to_string())?
        .finish_transfer_job(job, shelf, status, message)
}
