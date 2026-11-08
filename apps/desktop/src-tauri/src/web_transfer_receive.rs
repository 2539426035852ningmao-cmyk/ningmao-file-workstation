//! W3 Web -> Windows local receive staging. No HTTP listener and no remote disk paths.
//! This Tauri IPC surface is ONLY for a trusted native WebView after an explicit local
//! accept action. Cloudflare Access/device pairing and WebRTC transport are NOT here.
use crate::{
    Runtime, error, metadata_scope,
    store::{Result, Store},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, atomic::AtomicBool},
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

const MAX_BYTES: u64 = 64 * 1024 * 1024;
const MAX_CHUNK: usize = 64 * 1024;
const TTL: Duration = Duration::from_secs(600);
const MAX_SESSIONS: usize = 4;

#[derive(Default)]
pub struct WebReceiveControl {
    sessions: Mutex<HashMap<String, ReceiveSession>>,
}
struct ReceiveSession {
    owner: String,
    shelf: i64,
    job: i64,
    path: PathBuf,
    file: File,
    _temporary: tempfile::TempDir,
    expected: u64,
    written: u64,
    sha256: String,
    hasher: Sha256,
    issued: Instant,
}
struct VerifiedSession {
    _temporary: tempfile::TempDir,
    path: PathBuf,
    shelf: i64,
    job: i64,
}
#[derive(Serialize)]
pub struct ReceiveStarted {
    ticket: String,
    job_id: i64,
    bytes: u64,
    expires_in_seconds: u64,
}
#[derive(Serialize)]
pub struct ReceiveChunkStatus {
    received: u64,
    total: u64,
}
#[derive(Serialize)]
pub struct ReceivePublished {
    job_id: i64,
    file_name: String,
    bytes: u64,
    status: &'static str,
}
fn ticket_valid(ticket: &str) -> bool {
    ticket.len() == 36
        && ticket.bytes().enumerate().all(|(i, byte)| {
            if [8, 13, 18, 23].contains(&i) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
}
fn safe_name(name: &str) -> bool {
    if name.is_empty()
        || name.len() > 200
        || name.trim().is_empty()
        || name == "."
        || name == ".."
        || name.ends_with('.')
        || name.ends_with(' ')
        || name
            .chars()
            .any(|c| c.is_control() || "\\/:*?\"<>|".contains(c))
    {
        return false;
    }
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    !matches!(
        stem.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}
fn native_origin(window: &tauri::WebviewWindow) -> Result<()> {
    let url = window.url().map_err(error)?;
    if matches!(
        url.host_str(),
        Some("tauri.localhost" | "localhost" | "127.0.0.1")
    ) {
        Ok(())
    } else {
        Err("外部网页不能访问本机接收目录。".into())
    }
}
fn scoped(scope: Option<i64>, shelf: i64) -> Result<()> {
    if scope.is_some_and(|id| id != shelf) || shelf <= 0 {
        Err("只能将接收文件保存到当前文件架指定的绑定目录。".into())
    } else {
        Ok(())
    }
}
impl ReceiveSession {
    fn new(
        staging_root: &Path,
        owner: String,
        shelf: i64,
        job: i64,
        name: &str,
        expected: u64,
        sha256: String,
    ) -> Result<Self> {
        if !safe_name(name)
            || expected > MAX_BYTES
            || sha256.len() != 64
            || !sha256.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err("文件名、容量或 SHA-256 清单无效。".into());
        }
        fs::create_dir_all(staging_root).map_err(error)?;
        // Reject a pre-planted staging junction/symlink escaping the application data root.
        let canonical_root =
            fs::canonicalize(staging_root.parent().ok_or("暂存目录缺少可信父目录")?)
                .map_err(error)?;
        let canonical_staging = fs::canonicalize(staging_root).map_err(error)?;
        if canonical_staging.parent() != Some(canonical_root.as_path())
            || fs::symlink_metadata(staging_root)
                .map_err(error)?
                .file_type()
                .is_symlink()
        {
            return Err("暂存目录已被重定向，拒绝写入".into());
        }
        let temporary = tempfile::Builder::new()
            .prefix(".ningmao-web-incoming-")
            .tempdir_in(staging_root)
            .map_err(error)?;
        let path = temporary.path().join(name);
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(error)?;
        Ok(Self {
            owner,
            shelf,
            job,
            path,
            file,
            _temporary: temporary,
            expected,
            written: 0,
            sha256: sha256.to_ascii_lowercase(),
            hasher: Sha256::new(),
            issued: Instant::now(),
        })
    }
    fn append(&mut self, offset: u64, encoded: &str) -> Result<ReceiveChunkStatus> {
        if self.issued.elapsed() >= TTL {
            return Err("接收授权已过期，未保存文件。".into());
        }
        if offset != self.written || encoded.len() > MAX_CHUNK * 2 || encoded.is_empty() {
            return Err("文件分块偏移量或长度不合法。".into());
        }
        let bytes = STANDARD.decode(encoded).map_err(|_| "文件分块编码无效")?;
        if bytes.is_empty()
            || bytes.len() > MAX_CHUNK
            || self.written + bytes.len() as u64 > self.expected
        {
            return Err("文件分块超出已确认的容量。".into());
        }
        self.file.write_all(&bytes).map_err(error)?;
        self.hasher.update(&bytes);
        self.written += bytes.len() as u64;
        Ok(ReceiveChunkStatus {
            received: self.written,
            total: self.expected,
        })
    }
    fn verify(mut self) -> Result<VerifiedSession> {
        if self.issued.elapsed() >= TTL || self.written != self.expected {
            return Err("文件未收齐或接收授权已过期，禁止保存。".into());
        }
        let digest = format!("{:x}", self.hasher.finalize());
        if digest != self.sha256 {
            return Err("文件 SHA-256 校验失败，拒绝写入绑定目录。".into());
        }
        self.file.flush().map_err(error)?;
        self.file.sync_all().map_err(error)?;
        drop(self.file);
        Ok(VerifiedSession {
            _temporary: self._temporary,
            path: self.path,
            shelf: self.shelf,
            job: self.job,
        })
    }
}
fn stage(
    control: &WebReceiveControl,
    store: &mut Store,
    root: &Path,
    owner: &str,
    scope: Option<i64>,
    shelf: i64,
    ticket: &str,
    name: &str,
    size: u64,
    sha256: &str,
) -> Result<ReceiveStarted> {
    scoped(scope, shelf)?;
    if !ticket_valid(ticket)
        || !safe_name(name)
        || size > MAX_BYTES
        || sha256.len() != 64
        || !sha256.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("接收清单不合法，未创建文件。".into());
    }
    // Only a pre-existing bound shelf. No remote-supplied folder or absolute path.
    if store.shelf(shelf)?.root.is_none() {
        return Err("接收前请在 Windows 工作站绑定一个真实文件夹。".into());
    }
    let mut sessions = control.sessions.lock().map_err(error)?;
    let stale: Vec<String> = sessions
        .iter()
        .filter(|(_, s)| s.issued.elapsed() >= TTL)
        .map(|(id, _)| id.clone())
        .collect();
    for id in stale {
        if let Some(old) = sessions.remove(&id) {
            let _ = store.finish_transfer_job(
                old.job,
                old.shelf,
                "interrupted",
                "网页接收超时，临时文件已清理",
            );
        }
    }
    if sessions.len() >= MAX_SESSIONS || sessions.contains_key(ticket) {
        return Err("本机待接收任务已满或任务票据重复。".into());
    }
    // Create temp first; a failed disk allocation does not create a phantom job.
    let staging_root = root.join("web-receive-staging");
    let mut session = ReceiveSession::new(
        &staging_root,
        owner.to_owned(),
        shelf,
        0,
        name,
        size,
        sha256.to_owned(),
    )?;
    let job = store.begin_job(shelf, "网页接收：等待文件数据")?;
    if let Err(err) = store.stage_job(job, &session.path) {
        let _ = store.finish_transfer_job(job, shelf, "failed", "网页接收暂存失败");
        return Err(err);
    }
    session.job = job;
    sessions.insert(ticket.to_owned(), session);
    Ok(ReceiveStarted {
        ticket: ticket.to_owned(),
        job_id: job,
        bytes: size,
        expires_in_seconds: TTL.as_secs(),
    })
}
fn owned<'a>(
    sessions: &'a mut HashMap<String, ReceiveSession>,
    ticket: &str,
    owner: &str,
    scope: Option<i64>,
) -> Result<&'a mut ReceiveSession> {
    let item = sessions
        .get_mut(ticket)
        .ok_or("网页接收任务已结束或不存在")?;
    if item.owner != owner {
        return Err("不能使用其他窗口的接收票据".into());
    }
    scoped(scope, item.shelf)?;
    Ok(item)
}
fn publish(store: &mut Store, session: ReceiveSession) -> Result<ReceivePublished> {
    let job = session.job;
    let shelf = session.shelf;
    let count = session.expected;
    let verified = match session.verify() {
        Ok(value) => value,
        Err(err) => {
            let _ = store.finish_transfer_job(job, shelf, "failed", "网页接收校验未通过");
            return Err(err);
        }
    };
    // Store::copy_one uses the original filename in a fresh, unique destination,
    // safely stages in the bound root and records the file reference. Never overwrite.
    let copied = store.copy_one(
        verified.shelf,
        &verified.path,
        &AtomicBool::new(false),
        |_, _| {},
    );
    let path = match copied {
        Ok(path) => path,
        Err(err) => {
            let _ =
                store.finish_transfer_job(job, shelf, "failed", "网页接收复制失败，既有文件保留");
            return Err(err);
        }
    };
    store
        .finish_transfer_job(
            job,
            shelf,
            "completed",
            "网页文件接收校验完成并保存到绑定目录",
        )
        .map_err(|_| "文件已复制，但任务状态写入失败：请在绑定目录核对，不要重复发送".to_owned())?;
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("已保存文件")
        .to_owned();
    Ok(ReceivePublished {
        job_id: job,
        file_name: name,
        bytes: count,
        status: "completed",
    })
}
/// Only the local trusted Tauri renderer calls this AFTER the user accepts the transfer.
#[tauri::command]
pub async fn web_receive_prepare(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
    ticket: String,
    name: String,
    bytes: u64,
    sha256: String,
) -> Result<ReceiveStarted> {
    native_origin(&window)?;
    let scope = metadata_scope(&window)?;
    scoped(scope, shelf_id)?;
    if !ticket_valid(&ticket)
        || !safe_name(&name)
        || bytes > MAX_BYTES
        || sha256.len() != 64
        || !sha256.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("文件接收请求不安全，未进入确认步骤".into());
    }
    // A trusted renderer cannot silently save a remote file: Windows owner
    // must actively approve via the native dialog before any staging/job writes.
    let confirmation_app = app.clone();
    let confirmation_window = window.clone();
    let prompt_name = name.clone();
    let approved = tauri::async_runtime::spawn_blocking(move || {
        confirmation_app
            .dialog()
            .message(format!(
                "是否接收网页传来的文件？\n\n名称：{prompt_name}\n大小：{bytes} 字节\n保存位置：当前工作站绑定文件架（编号 {shelf_id}）\n\n文件会先进行 SHA-256 校验，保存时不会覆盖已有文件。"
            ))
            .title("确认接收网页文件")
            .parent(&confirmation_window)
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
                "确认接收".into(),
                "拒绝".into(),
            ))
            .blocking_show()
    })
    .await
    .map_err(error)?;
    if !approved {
        return Err("已拒绝接收，未创建本机文件".into());
    }
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let mut store = state.store.lock().map_err(error)?;
        stage(
            &state.web_receives,
            &mut store,
            &state.data_root,
            &owner,
            scope,
            shelf_id,
            &ticket,
            &name,
            bytes,
            &sha256,
        )
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub async fn web_receive_append(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    ticket: String,
    offset: u64,
    data_base64: String,
) -> Result<ReceiveChunkStatus> {
    native_origin(&window)?;
    let scope = metadata_scope(&window)?;
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let mut sessions = state.web_receives.sessions.lock().map_err(error)?;
        owned(&mut sessions, &ticket, &owner, scope)?.append(offset, &data_base64)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub async fn web_receive_finish(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    ticket: String,
) -> Result<ReceivePublished> {
    native_origin(&window)?;
    let scope = metadata_scope(&window)?;
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let session = {
            let mut sessions = state.web_receives.sessions.lock().map_err(error)?;
            owned(&mut sessions, &ticket, &owner, scope)?;
            sessions.remove(&ticket).ok_or("网页接收任务已结束")?
        };
        let mut store = state.store.lock().map_err(error)?;
        let result = publish(&mut store, session);
        let _ = app.emit("workstation-changed", ());
        result
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub async fn web_receive_abort(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    ticket: String,
) -> Result<()> {
    native_origin(&window)?;
    let scope = metadata_scope(&window)?;
    let owner = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let cancelled = {
            let mut sessions = state.web_receives.sessions.lock().map_err(error)?;
            owned(&mut sessions, &ticket, &owner, scope)?;
            sessions.remove(&ticket).ok_or("任务已结束")?
        };
        let mut store = state.store.lock().map_err(error)?;
        store.finish_transfer_job(
            cancelled.job,
            cancelled.shelf,
            "cancelled",
            "网页接收已取消，未保存到绑定目录",
        )?;
        drop(cancelled);
        let _ = app.emit("workstation-changed", ());
        Ok(())
    })
    .await
    .map_err(error)?
}
#[cfg(test)]
mod tests {
    use super::*;
    fn hash(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }
    fn store_with_root(dir: &Path) -> (Store, i64, PathBuf) {
        let mut store = Store::open(&dir.join("db.sqlite3")).unwrap();
        let bound = dir.join("bound");
        fs::create_dir(&bound).unwrap();
        let shelf = store.bind_directory(&bound).unwrap();
        (store, shelf, bound)
    }
    #[test]
    fn receive_chunks_verified_then_safely_copy_without_overwriting() {
        let root = tempfile::tempdir().unwrap();
        let (mut store, shelf, bound) = store_with_root(root.path());
        fs::write(bound.join("synthetic.txt"), b"existing file untouched").unwrap();
        let control = WebReceiveControl::default();
        let ticket = "28560890-e97d-4fab-83c8-937b816d10cd";
        let expected = b"synthetic web payload for Ningmao";
        let offer = stage(
            &control,
            &mut store,
            root.path(),
            "manager",
            None,
            shelf,
            ticket,
            "synthetic.txt",
            expected.len() as u64,
            &hash(expected),
        )
        .unwrap();
        assert!(offer.job_id > 0);
        {
            let mut sessions = control.sessions.lock().unwrap();
            let item = owned(&mut sessions, ticket, "manager", None).unwrap();
            let one = &expected[..10];
            assert_eq!(item.append(0, &STANDARD.encode(one)).unwrap().received, 10);
            assert!(item.append(0, &STANDARD.encode(one)).is_err());
            assert!(item.append(10, "not-base64").is_err());
            item.append(10, &STANDARD.encode(&expected[10..])).unwrap();
        }
        let item = control.sessions.lock().unwrap().remove(ticket).unwrap();
        let result = publish(&mut store, item).unwrap();
        assert_eq!(result.status, "completed");
        assert_eq!(
            fs::read(bound.join("synthetic.txt")).unwrap(),
            b"existing file untouched"
        );
        let new_file = bound.join(result.file_name);
        assert_ne!(new_file, bound.join("synthetic.txt"));
        assert_eq!(fs::read(new_file).unwrap(), expected);
        assert_eq!(
            fs::read_dir(root.path().join("web-receive-staging"))
                .unwrap()
                .count(),
            0
        );
        let jobs = store.snapshot().unwrap().jobs;
        assert!(
            jobs.iter()
                .any(|j| j.id == offer.job_id && j.status == "completed")
        );
    }
    #[test]
    fn reject_bad_hash_path_traversal_cross_window_and_incomplete_bytes() {
        let root = tempfile::tempdir().unwrap();
        let (mut store, shelf, bound) = store_with_root(root.path());
        let control = WebReceiveControl::default();
        let ticket = "18aba838-246f-4d0e-af08-1a27b536932a";
        for bad in [
            "../danger.txt",
            r"..\danger.txt",
            "CON.txt",
            "illegal:ads",
            "name.",
        ] {
            assert!(
                stage(
                    &control,
                    &mut store,
                    root.path(),
                    "manager",
                    None,
                    shelf,
                    ticket,
                    bad,
                    5,
                    &hash(b"hello")
                )
                .is_err()
            );
        }
        stage(
            &control,
            &mut store,
            root.path(),
            "shelf-1",
            Some(shelf),
            shelf,
            ticket,
            "safe.txt",
            5,
            &hash(b"other"),
        )
        .unwrap();
        {
            let mut sessions = control.sessions.lock().unwrap();
            assert!(owned(&mut sessions, ticket, "intruder", Some(shelf)).is_err());
            assert!(owned(&mut sessions, ticket, "shelf-1", Some(shelf + 1)).is_err());
            let item = owned(&mut sessions, ticket, "shelf-1", Some(shelf)).unwrap();
            item.append(0, &STANDARD.encode(b"hello")).unwrap();
        }
        let item = control.sessions.lock().unwrap().remove(ticket).unwrap();
        assert!(publish(&mut store, item).is_err());
        assert!(!bound.join("safe.txt").exists());
        assert_eq!(
            fs::read_dir(root.path().join("web-receive-staging"))
                .unwrap()
                .count(),
            0
        );
        assert!(
            store
                .snapshot()
                .unwrap()
                .jobs
                .iter()
                .any(|j| j.status == "failed")
        );
        assert!(safe_name("镜头 01.png"));
        assert!(!safe_name("LPT1.log"));
    }
    #[test]
    fn reject_incomplete_and_overflow_without_publishing() {
        let root = tempfile::tempdir().unwrap();
        let (mut store, shelf, bound) = store_with_root(root.path());
        let control = WebReceiveControl::default();
        let ticket = "b72ff401-e3a8-41d0-a510-bb57b83c1641";
        stage(
            &control,
            &mut store,
            root.path(),
            "manager",
            None,
            shelf,
            ticket,
            "partial.bin",
            5,
            &hash(b"hello"),
        )
        .unwrap();
        {
            let mut guard = control.sessions.lock().unwrap();
            let item = owned(&mut guard, ticket, "manager", None).unwrap();
            assert!(item.append(0, &STANDARD.encode(b"overflow")).is_err());
            item.append(0, &STANDARD.encode(b"hell")).unwrap();
        }
        let item = control.sessions.lock().unwrap().remove(ticket).unwrap();
        assert!(publish(&mut store, item).is_err());
        assert!(!bound.join("partial.bin").exists());
        assert_eq!(
            fs::read_dir(root.path().join("web-receive-staging"))
                .unwrap()
                .count(),
            0
        );
    }
}
