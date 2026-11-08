//! W3 local Web bridge: a user-selected reference -> short-lived, window-scoped chunks.
//! No listener, remote URL, cloud credentials, database migration or arbitrary path API.
//! This is not a network transport: the authenticated desktop session still needs its own WSS/WebRTC adapter.
use crate::{Runtime, error, metadata_scope, store::Result};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant, SystemTime},
};
use tauri::Manager;

const MAX_FILE: u64 = 64 * 1024 * 1024;
const MAX_CHUNK: u32 = 64 * 1024;
const PERMIT_TTL: Duration = Duration::from_secs(10 * 60);

#[derive(Clone)]
struct Permit {
    owner: String,
    shelf_id: i64,
    item_id: i64,
    path: PathBuf,
    size: u64,
    modified: Option<SystemTime>,
    issued: Instant,
}
#[derive(Default)]
pub struct WebTransferBridge {
    permits: Mutex<HashMap<String, Permit>>,
}
#[derive(Serialize)]
pub struct PreparedWebFile {
    pub ticket: String,
    pub item_id: i64,
    pub name: String,
    pub bytes: u64,
    pub expires_in_seconds: u64,
}
#[derive(Serialize)]
pub struct WebFileChunk {
    pub offset: u64,
    pub bytes: usize,
    pub data_base64: String,
    pub eof: bool,
}
fn valid_ticket(ticket: &str) -> bool {
    ticket.len() == 36 && ticket.bytes().enumerate().all(|(i, b)| {
        if [8, 13, 18, 23].contains(&i) {
            b == b'-'
        } else {
            b.is_ascii_hexdigit()
        }
    })
}
fn inspect(path: &Path) -> Result<(u64, Option<SystemTime>)> {
    let meta = fs::symlink_metadata(path).map_err(|_| "源文件不存在或无法读取")?;
    if !meta.file_type().is_file() {
        return Err("只能发送用户已选中的普通文件，不能发送目录或符号链接".into());
    }
    if meta.len() > MAX_FILE {
        return Err("Web 测试版每个文件最多 64 MiB".into());
    }
    Ok((meta.len(), meta.modified().ok()))
}
fn native_origin(window: &tauri::WebviewWindow) -> Result<()> {
    let url = window.url().map_err(error)?;
    if matches!(url.host_str(), Some("tauri.localhost" | "localhost" | "127.0.0.1")) {
        Ok(())
    } else {
        Err("外部网页没有访问本机文件的权限".into())
    }
}
impl WebTransferBridge {
    fn issue(
        &self,
        ticket: &str,
        owner: &str,
        shelf_id: i64,
        item_id: i64,
        path: PathBuf,
        name: String,
    ) -> Result<PreparedWebFile> {
        if !valid_ticket(ticket) || shelf_id <= 0 || item_id <= 0 {
            return Err("本机发送请求身份无效".into());
        }
        let (size, modified) = inspect(&path)?;
        let mut permits = self.permits.lock().map_err(error)?;
        permits.retain(|_, p| p.issued.elapsed() < PERMIT_TTL && p.owner != owner);
        if permits.len() >= 4 {
            return Err("其他本机文件架已有过多待发送文件".into());
        }
        permits.insert(
            ticket.to_string(),
            Permit {
                owner: owner.to_owned(),
                shelf_id,
                item_id,
                path,
                size,
                modified,
                issued: Instant::now(),
            },
        );
        Ok(PreparedWebFile {
            ticket: ticket.to_owned(),
            item_id,
            name,
            bytes: size,
            expires_in_seconds: PERMIT_TTL.as_secs(),
        })
    }
    fn permit(&self, ticket: &str, owner: &str, scope: Option<i64>) -> Result<Permit> {
        let mut permits = self.permits.lock().map_err(error)?;
        permits.retain(|_, p| p.issued.elapsed() < PERMIT_TTL);
        let item = permits.get(ticket).ok_or("发送授权已过期，请重新选择文件")?;
        if item.owner != owner || scope.is_some_and(|id| id != item.shelf_id) {
            return Err("不能读取其他窗口或其他文件架的文件".into());
        }
        Ok(item.clone())
    }
    fn release(&self, ticket: &str, owner: &str) -> Result<()> {
        let mut permits = self.permits.lock().map_err(error)?;
        if permits.get(ticket).is_some_and(|p| p.owner != owner) {
            return Err("不能撤销其他窗口的发送任务".into());
        }
        permits.remove(ticket);
        Ok(())
    }
}
fn read_owned(permit: &Permit, offset: u64, size: u32) -> Result<WebFileChunk> {
    if size == 0 || size > MAX_CHUNK || offset > permit.size {
        return Err("分块范围无效".into());
    }
    let (current_size, current_modified) = inspect(&permit.path)?;
    if current_size != permit.size || current_modified != permit.modified {
        return Err("源文件在发送期间发生变化，请重新选择".into());
    }
    let length = (size as u64).min(permit.size - offset) as usize;
    let mut file = File::open(&permit.path).map_err(|_| "源文件无法打开")?;
    file.seek(SeekFrom::Start(offset)).map_err(error)?;
    let mut data = vec![0; length];
    file.read_exact(&mut data).map_err(|_| "文件读取中断，未发送数据")?;
    Ok(WebFileChunk {
        offset,
        bytes: length,
        data_base64: STANDARD.encode(data),
        eof: offset + length as u64 == permit.size,
    })
}
/// Creates a permit for exactly one locally selected reference; no bytes leave this command.
#[tauri::command]
pub fn web_transfer_prepare(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
    item_id: i64,
    ticket: String,
) -> Result<PreparedWebFile> {
    native_origin(&window)?;
    let scope = metadata_scope(&window)?;
    if scope.is_some_and(|id| id != shelf_id) {
        return Err("只能从当前文件架选择发送文件".into());
    }
    let state = app.state::<Runtime>();
    let mut store = state.store.lock().map_err(error)?;
    store.validate_item_scope(scope, &[item_id])?;
    let item = store
        .management_snapshot()?
        .items
        .into_iter()
        .find(|r| r.id == item_id && r.shelf_id == shelf_id)
        .ok_or("文件不属于指定文件架")?;
    let path = store.opening_target(item_id)?;
    drop(store);
    state.web_transfers.issue(&ticket, window.label(), shelf_id, item_id, path, item.name)
}
#[tauri::command]
pub async fn web_transfer_read_chunk(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    ticket: String,
    offset: u64,
    size: u32,
) -> Result<WebFileChunk> {
    native_origin(&window)?;
    let scope = metadata_scope(&window)?;
    let permit = app
        .state::<Runtime>()
        .web_transfers
        .permit(&ticket, window.label(), scope)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let store = state.store.lock().map_err(error)?;
        store.validate_item_scope(scope, &[permit.item_id])?;
        store.validate_opening_target(permit.item_id, &permit.path)?;
        drop(store);
        read_owned(&permit, offset, size)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub fn web_transfer_release(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    ticket: String,
) -> Result<()> {
    native_origin(&window)?;
    metadata_scope(&window)?;
    app.state::<Runtime>().web_transfers.release(&ticket, window.label())
}

#[cfg(test)]
mod tests {
    use super::*;
    const TICKET: &str = "127aa663-1462-44dd-bb06-c3e64397c5a2";
    #[test]
    fn only_owned_window_can_read_selected_file() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("synthetic.txt");
        fs::write(&path, b"abc123").unwrap();
        let bridge = WebTransferBridge::default();
        bridge.issue(TICKET, "file-1", 1, 7, path, "synthetic.txt".into()).unwrap();
        assert!(bridge.permit(TICKET, "file-2", Some(1)).is_err());
        assert!(bridge.permit(TICKET, "file-1", Some(2)).is_err());
        let permit = bridge.permit(TICKET, "file-1", Some(1)).unwrap();
        let chunk = read_owned(&permit, 0, MAX_CHUNK).unwrap();
        assert_eq!(chunk.bytes, 6);
        assert_eq!(chunk.data_base64, STANDARD.encode(b"abc123"));
        assert!(chunk.eof);
        assert!(read_owned(&permit, 8, 1).is_err());
        assert!(read_owned(&permit, 0, MAX_CHUNK + 1).is_err());
        bridge.release(TICKET, "file-1").unwrap();
        assert!(bridge.permit(TICKET, "file-1", Some(1)).is_err());
    }
    #[test]
    fn changes_and_directories_fail_closed() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("selected.dat");
        fs::write(&path, b"first").unwrap();
        let bridge = WebTransferBridge::default();
        let permit = bridge.issue(TICKET, "manager", 1, 8, path.clone(), "selected.dat".into()).unwrap();
        assert_eq!(permit.bytes, 5);
        fs::write(&path, b"longer changed content").unwrap();
        let saved = bridge.permit(TICKET, "manager", None).unwrap();
        assert!(read_owned(&saved, 0, 10).is_err());
        assert!(bridge.issue(TICKET, "manager", 1, 9, root.path().into(), "root".into()).is_err());
        assert!(bridge.issue("invalid", "manager", 1, 9, path, "bad".into()).is_err());
    }
}
