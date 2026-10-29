//! Trusted localhost sender; the caller authorizes the shelf and opens source handles.
pub use crate::loopback_transport::LoopbackClient as LocalhostTransferClient;
use crate::store::{Result, Store};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};

const MAX_FILE: u64 = 512 * 1024 * 1024;

pub struct SendFile<'a> {
    pub source: &'a mut File,
    pub name: &'a str,
}
#[derive(Clone, Debug, Serialize)]
pub struct SendProgress {
    pub job_id: i64,
    pub phase: &'static str,
    pub file_index: usize,
    pub file_count: usize,
    pub file_bytes: u64,
    pub file_total: u64,
    pub bytes: u64,
    pub total: u64,
}
#[derive(Debug, Serialize)]
pub struct FileSendResult {
    pub index: usize,
    pub status: &'static str,
    pub bytes: u64,
}
#[derive(Debug, Serialize)]
pub struct SendResult {
    pub job_id: i64,
    pub status: &'static str,
    pub message: String,
    pub files: Vec<FileSendResult>,
}

pub fn send_open_file(
    store: &Mutex<Store>,
    shelf: i64,
    client: &LocalhostTransferClient,
    source: &mut File,
    name: &str,
) -> Result<i64> {
    let result = send_open_files(
        store,
        shelf,
        client,
        &mut [SendFile { source, name }],
        &AtomicBool::new(false),
        |_| {},
    )?;
    if result.status == "completed" {
        Ok(result.job_id)
    } else {
        Err("文件未完成接收，来源文件保留。".into())
    }
}

/// The caller runs this blocking operation off the UI thread and owns cancellation.
pub fn send_open_files(
    store: &Mutex<Store>,
    shelf: i64,
    client: &LocalhostTransferClient,
    sources: &mut [SendFile<'_>],
    cancelled: &AtomicBool,
    mut notify: impl FnMut(&SendProgress),
) -> Result<SendResult> {
    if sources.is_empty() || sources.len() > 16 {
        return Err("一次可发送 1–16 个普通文件。".into());
    }
    let sizes = sources
        .iter()
        .map(|source| {
            if source.name.is_empty()
                || source.name.len() > 240
                || source.name.contains(['/', '\\'])
                || source.name.chars().any(char::is_control)
            {
                return Err("文件名不可用于传输。".to_string());
            }
            let metadata = source
                .source
                .metadata()
                .map_err(|_| "无法读取所选文件。".to_string())?;
            if !metadata.is_file() || metadata.len() > MAX_FILE {
                return Err("仅支持不超过 512 MiB 的普通文件。".into());
            }
            Ok(metadata.len())
        })
        .collect::<Result<Vec<_>>>()?;
    let job = store
        .lock()
        .map_err(|_| "任务存储不可用。".to_string())?
        .begin_job(shelf, "发送文件：准备中")?;
    let mut result = SendResult {
        job_id: job,
        status: "failed",
        message: String::new(),
        files: (0..sources.len())
            .map(|index| FileSendResult {
                index,
                status: "not_sent",
                bytes: 0,
            })
            .collect(),
    };
    let total = sizes.iter().sum();
    notify(&SendProgress {
        job_id: job,
        phase: "preparing",
        file_index: 0,
        file_count: sizes.len(),
        file_bytes: 0,
        file_total: sizes[0],
        bytes: 0,
        total,
    });
    let mut confirmed_bytes = 0;
    let mut session = None;
    let transfer = (|| -> Result<()> {
        let mut manifest = serde_json::Map::new();
        for (index, source) in sources.iter_mut().enumerate() {
            let sha = hash_source(source.source, sizes[index], cancelled)?;
            manifest.insert(
                format!("f{index}"),
                serde_json::json!({"fileName":source.name,"size":sizes[index],"sha256":sha}),
            );
        }
        if cancelled.load(Ordering::SeqCst) {
            return Err("已取消发送。".into());
        }
        finish_job(store, job, shelf, "queued", "发送文件：等待对方确认")?;
        notify(&SendProgress {
            job_id: job,
            phase: "waiting",
            file_index: 0,
            file_count: sizes.len(),
            file_bytes: 0,
            file_total: sizes[0],
            bytes: 0,
            total,
        });
        let (status, plan) = client
            .prepare(manifest.into())
            .map_err(|_| "连接失败，请重试。".to_string())?;
        if status != 200 {
            return Err("对方未接受文件。".into());
        }
        let id = plan["sessionId"]
            .as_str()
            .ok_or("传输准备响应无效。")?
            .to_owned();
        session = Some(id.clone());
        for (index, source) in sources.iter_mut().enumerate() {
            let file_id = format!("f{index}");
            let Some(token) = plan["files"][&file_id].as_str() else {
                result.files[index].status = "rejected";
                continue;
            };
            if cancelled.load(Ordering::SeqCst) {
                return Err("已取消发送。".into());
            }
            let mut last_bytes = 0;
            let mut last_emit = Instant::now();
            let file_total = sizes[index];
            let count = sizes.len();
            result.files[index].status = "sending";
            let upload = client.upload_with_progress(
                &id,
                &file_id,
                token,
                file_total,
                source.source,
                |bytes| {
                    result.files[index].bytes = bytes;
                    if bytes == 0
                        || bytes == file_total
                        || bytes - last_bytes >= 1024 * 1024
                        || last_emit.elapsed() >= Duration::from_millis(100)
                    {
                        let event = SendProgress {
                            job_id: job,
                            phase: "sending",
                            file_index: index,
                            file_count: count,
                            file_bytes: bytes,
                            file_total,
                            bytes: confirmed_bytes + bytes,
                            total,
                        };
                        finish_job(
                            store,
                            job,
                            shelf,
                            "copying",
                            &format!(
                                "发送中 · {}/{} 项 · {}/{} B",
                                index, count, event.bytes, total
                            ),
                        )?;
                        notify(&event);
                        last_bytes = bytes;
                        last_emit = Instant::now();
                    }
                    // A fully written body must consume its response to learn whether it committed.
                    if bytes < file_total && cancelled.load(Ordering::SeqCst) {
                        return Err("已取消发送。".into());
                    }
                    Ok(())
                },
            );
            match upload {
                Ok((200, _)) => {
                    result.files[index].status = "completed";
                    confirmed_bytes += file_total;
                }
                Ok(_) => {
                    result.files[index].status = "failed";
                    return Err("对方未完成接收。".into());
                }
                Err(_) => {
                    result.files[index].status = "unconfirmed";
                    return Err("传输中断，请核对接收结果。".into());
                }
            }
        }
        Ok(())
    })();
    let completed = result
        .files
        .iter()
        .filter(|file| file.status == "completed")
        .count();
    let uncertain = result
        .files
        .iter()
        .any(|file| file.status == "unconfirmed" && file.bytes == sizes[file.index]);
    let cancelling = cancelled.load(Ordering::SeqCst) && completed != sources.len();
    let cancel_ack = if transfer.is_err() || cancelling {
        session
            .as_ref()
            .map(|id| client.cancel(id).is_ok_and(|(status, _)| status == 200))
            .unwrap_or(true)
    } else {
        true
    };
    result.status = if completed == sources.len() {
        "completed"
    } else if uncertain {
        "interrupted"
    } else if cancelling && cancel_ack {
        for file in &mut result.files {
            if matches!(file.status, "not_sent" | "sending" | "unconfirmed") {
                file.status = "cancelled";
            }
        }
        "cancelled"
    } else if !cancel_ack {
        "interrupted"
    } else if completed > 0 {
        "partial"
    } else {
        "failed"
    };
    let label = match result.status {
        "completed" => "发送完成",
        "cancelled" => "已停止发送，已确认接收文件保留",
        "partial" => "部分完成，请核对接收结果",
        "interrupted" => "发送中断，接收结果未确认",
        _ => "发送失败，来源文件保留",
    };
    result.message = format!(
        "{label} · {completed}/{} 项 · {confirmed_bytes}/{total} B",
        sources.len()
    );
    if result.status == "failed"
        && let Err(reason) = transfer
    {
        result.message.push_str(&format!(" · {reason}"));
    }
    finish_job(store, job, shelf, result.status, &result.message)?;
    notify(&SendProgress {
        job_id: job,
        phase: result.status,
        file_index: sources.len() - 1,
        file_count: sizes.len(),
        file_bytes: result.files.last().map_or(0, |file| file.bytes),
        file_total: *sizes.last().unwrap(),
        bytes: result.files.iter().map(|file| file.bytes).sum(),
        total,
    });
    Ok(result)
}

fn hash_source(source: &mut File, size: u64, cancelled: &AtomicBool) -> Result<String> {
    source
        .seek(SeekFrom::Start(0))
        .map_err(|_| "无法读取所选文件。".to_string())?;
    let mut digest = Sha256::new();
    let mut count = 0;
    let mut buffer = [0; 64 * 1024];
    loop {
        if cancelled.load(Ordering::SeqCst) {
            return Err("已取消发送。".into());
        }
        let read = source
            .read(&mut buffer)
            .map_err(|_| "无法读取所选文件。".to_string())?;
        if read == 0 {
            break;
        }
        count += read as u64;
        if count > size {
            return Err("所选文件大小已变化，请重试。".into());
        }
        digest.update(&buffer[..read]);
    }
    if count != size {
        return Err("所选文件大小已变化，请重试。".into());
    }
    source
        .seek(SeekFrom::Start(0))
        .map_err(|_| "无法读取所选文件。".to_string())?;
    Ok(format!("{:x}", digest.finalize()))
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
