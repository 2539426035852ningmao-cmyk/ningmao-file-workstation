//! Selected-reference preview. No arbitrary paths, listeners or active document rendering.
//! Range response approach: Tauri streaming example (MIT/Apache-2.0), with per-window
//! tickets, registered-item revalidation and bounded reads instead of public file paths.
use crate::{
    Runtime, error, shelf_windows,
    store::{self, Result},
};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs::{File, OpenOptions},
    io::{Read, Seek, SeekFrom},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{
    Manager,
    http::{Request, Response},
};
const CHUNK: u64 = 2 * 1024 * 1024;
const TEXT: u64 = 1024 * 1024;
struct Permit {
    owner: String,
    id: i64,
    path: PathBuf,
    file: Mutex<File>,
    mime: &'static str,
    size: u64,
    issued: Instant,
}
#[derive(Default)]
pub struct Previews {
    permits: Mutex<HashMap<String, Arc<Permit>>>,
}
impl Previews {
    pub fn close_owner(&self, owner: &str) {
        if let Ok(mut permits) = self.permits.lock() {
            permits.retain(|_, p| p.owner != owner);
        }
    }
}
#[derive(Serialize)]
pub struct Prepared {
    kind: &'static str,
    url: Option<String>,
    text: Option<String>,
    ticket: Option<String>,
    truncated: bool,
}
impl Prepared {
    fn empty() -> Self {
        Self {
            kind: "unsupported",
            url: None,
            text: None,
            ticket: None,
            truncated: false,
        }
    }
}
fn media(ext: &str) -> Option<(&'static str, &'static str)> {
    Some(match ext {
        "wav" => ("audio", "audio/wav"),
        "mp3" => ("audio", "audio/mpeg"),
        "m4a" => ("audio", "audio/mp4"),
        "aac" => ("audio", "audio/aac"),
        "ogg" => ("audio", "audio/ogg"),
        "flac" => ("audio", "audio/flac"),
        "mp4" | "m4v" => ("video", "video/mp4"),
        "webm" => ("video", "video/webm"),
        "ogv" => ("video", "video/ogg"),
        "mov" => ("video", "video/quicktime"),
        _ => return None,
    })
}
pub(crate) fn open(path: &std::path::Path) -> Result<File> {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(1).custom_flags(0x00200000);
    }
    let file = options.open(path).map_err(|_| "文件暂时无法读取")?;
    if !file.metadata().map_err(error)?.is_file() {
        return Err("仅预览普通文件".into());
    }
    Ok(file)
}
pub fn prepare_owned(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    id: i64,
) -> Result<Prepared> {
    crate::trusted_native_origin(window)?;
    let scope = shelf_windows::scope(window)?;
    let runtime = app.state::<Runtime>();
    let path = {
        let s = runtime.store.lock().map_err(error)?;
        s.validate_item_scope(scope, &[id])?;
        s.opening_target(id)?
    };
    let ext = path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mut result = Prepared::empty();
    if ["png", "jpg", "jpeg", "webp"].contains(&ext.as_str()) {
        let _decoder = runtime.thumbnail.lock().map_err(error)?;
        result.url = store::image_preview(&path, 1600)?;
        result.kind = "image";
    } else if [
        "txt", "md", "csv", "json", "log", "xml", "yaml", "yml", "toml", "ini", "rs", "ts", "tsx",
        "js", "css", "html", "svg",
    ]
    .contains(&ext.as_str())
    {
        let file = open(&path)?;
        let mut bytes = Vec::new();
        file.take(TEXT + 1).read_to_end(&mut bytes).map_err(error)?;
        result.truncated = bytes.len() as u64 > TEXT;
        bytes.truncate(TEXT as usize);
        let text = if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
            let be = bytes[0] == 0xfe;
            let units = bytes[2..]
                .as_chunks::<2>()
                .0
                .iter()
                .map(|b| {
                    if be {
                        u16::from_be_bytes([b[0], b[1]])
                    } else {
                        u16::from_le_bytes([b[0], b[1]])
                    }
                })
                .collect::<Vec<_>>();
            String::from_utf16_lossy(&units)
        } else {
            String::from_utf8_lossy(&bytes)
                .trim_start_matches('\u{feff}')
                .to_owned()
        };
        if text.contains('\0') {
            return Err("此文件不是可预览的文本，请用默认程序打开".into());
        }
        result.kind = "text";
        result.text = Some(text);
    } else if let Some((kind, mime)) = media(&ext) {
        let file = open(&path)?;
        let size = file.metadata().map_err(error)?.len();
        if size == 0 {
            return Err("文件为空，无法播放".into());
        }
        let ticket = uuid::Uuid::new_v4().to_string();
        let mut permits = runtime.previews.permits.lock().map_err(error)?;
        permits.retain(|_, p| p.issued.elapsed() < Duration::from_secs(3600));
        if permits.len() >= 16 {
            return Err("预览窗口过多，请先关闭其他预览".into());
        }
        permits.insert(
            ticket.clone(),
            Arc::new(Permit {
                owner: window.label().into(),
                id,
                path: path.clone(),
                file: Mutex::new(file),
                mime,
                size,
                issued: Instant::now(),
            }),
        );
        result.kind = kind;
        result.ticket = Some(ticket);
    }
    let s = runtime.store.lock().map_err(error)?;
    s.validate_item_scope(scope, &[id])?;
    s.validate_opening_target(id, &path)?;
    Ok(result)
}
#[tauri::command]
pub async fn preview_prepare(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: i64,
) -> Result<Prepared> {
    tauri::async_runtime::spawn_blocking(move || prepare_owned(&app, &window, id))
        .await
        .map_err(error)?
}
#[tauri::command]
pub fn preview_release(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    ticket: String,
) -> Result<()> {
    let runtime = app.state::<Runtime>();
    let mut permits = runtime.previews.permits.lock().map_err(error)?;
    if permits
        .get(&ticket)
        .is_some_and(|p| p.owner != window.label())
    {
        return Err("不能关闭其他窗口的预览".into());
    }
    permits.remove(&ticket);
    Ok(())
}
fn range(header: Option<&str>, len: u64) -> Option<(u64, u64)> {
    if len == 0 {
        return None;
    }
    let Some(header) = header else {
        return Some((0, (len - 1).min(CHUNK - 1)));
    };
    let (start, end) = header.strip_prefix("bytes=")?.split_once('-')?;
    let (start, end) = if start.is_empty() {
        let suffix = end.parse::<u64>().ok()?;
        if suffix == 0 {
            return None;
        }
        (len.saturating_sub(suffix), len - 1)
    } else {
        let start = start.parse::<u64>().ok()?;
        let end = if end.is_empty() {
            len - 1
        } else {
            end.parse::<u64>().ok()?.min(len - 1)
        };
        (start, end)
    };
    if start >= len || end < start {
        return None;
    }
    Some((start, end.min(start.saturating_add(CHUNK - 1))))
}
fn empty(code: u16) -> Response<Vec<u8>> {
    Response::builder()
        .status(code)
        .header("Cache-Control", "no-store")
        .body(Vec::new())
        .unwrap()
}
pub fn serve(app: &tauri::AppHandle, owner: &str, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method() != "GET" && request.method() != "HEAD" {
        return empty(405);
    }
    let ticket = request.uri().path().trim_start_matches('/');
    if uuid::Uuid::parse_str(ticket).is_err() {
        return empty(404);
    }
    let runtime = app.state::<Runtime>();
    let permit = runtime
        .previews
        .permits
        .lock()
        .ok()
        .and_then(|p| p.get(ticket).cloned());
    let Some(p) =
        permit.filter(|p| p.owner == owner && p.issued.elapsed() < Duration::from_secs(3600))
    else {
        return empty(403);
    };
    let valid = (|| -> Result<()> {
        let window = app.get_webview_window(owner).ok_or("窗口已关闭")?;
        if !window.is_visible().map_err(error)? {
            return Err("窗口已收起".into());
        }
        let scope = shelf_windows::scope(&window)?;
        let s = runtime.store.lock().map_err(error)?;
        s.validate_item_scope(scope, &[p.id])?;
        s.validate_opening_target(p.id, &p.path)
    })();
    if valid.is_err() {
        return empty(403);
    }
    let header = request.headers().get("range").and_then(|v| v.to_str().ok());
    let Some((start, end)) = range(header, p.size) else {
        return Response::builder()
            .status(416)
            .header("Content-Range", format!("bytes */{}", p.size))
            .body(Vec::new())
            .unwrap();
    };
    let mut file = match p.file.lock() {
        Ok(f) => f,
        Err(_) => return empty(500),
    };
    let mut body = vec![0; (end - start + 1) as usize];
    if request.method() != "HEAD"
        && (file.seek(SeekFrom::Start(start)).is_err() || file.read_exact(&mut body).is_err())
    {
        return empty(409);
    }
    let partial = header.is_some() || end + 1 < p.size;
    let mut builder = Response::builder()
        .status(if partial { 206 } else { 200 })
        .header("Content-Type", p.mime)
        .header("Accept-Ranges", "bytes")
        .header("Content-Length", body.len())
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff");
    if partial {
        builder = builder.header("Content-Range", format!("bytes {start}-{end}/{}", p.size));
    }
    if let Some(origin) = request
        .headers()
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .filter(|v| {
            matches!(
                *v,
                "http://tauri.localhost"
                    | "https://tauri.localhost"
                    | "tauri://localhost"
                    | "http://localhost:1431"
            )
        })
    {
        builder = builder.header("Access-Control-Allow-Origin", origin);
    }
    if request.method() == "HEAD" {
        body.clear();
    }
    builder.body(body).unwrap()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ranges_are_bounded_and_invalid_requests_rejected() {
        assert_eq!(range(Some("bytes=2-5"), 10), Some((2, 5)));
        assert_eq!(range(Some("bytes=-3"), 10), Some((7, 9)));
        assert_eq!(range(Some("bytes=4-"), 10), Some((4, 9)));
        assert_eq!(range(None, CHUNK * 10), Some((0, CHUNK - 1)));
        for bad in [
            "bytes=12-",
            "bytes=5-2",
            "bytes=-0",
            "bytes=1-2,4-5",
            "bytes=x-",
            "../../a",
        ] {
            assert_eq!(range(Some(bad), 10), None);
        }
        assert_eq!(range(None, 0), None);
    }
    #[test]
    fn active_documents_are_not_media() {
        for ext in ["html", "svg", "exe", "pdf", "lnk"] {
            assert!(media(ext).is_none());
        }
        assert_eq!(media("wav"), Some(("audio", "audio/wav")));
    }
}
