use crate::{
    Runtime, error, metadata_scope, store::Result, transfer_identity, trusted_native_origin,
};
use reqwest::{Client, RequestBuilder, Response, Url, header, redirect::Policy};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{path::PathBuf, time::Duration};
use tauri::Manager;
use tokio::sync::Mutex;

const MAX_FILE: usize = 64 * 1024 * 1024;
const MAX_JSON: usize = 1024 * 1024;

#[derive(Default)]
pub struct Rooms {
    joining: Mutex<()>,
}

struct Invitation {
    origin: Url,
    code: String,
}

pub(crate) fn hex(value: &str, size: usize) -> bool {
    value.len() == size
        && value
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

pub(crate) fn station_url(value: &str) -> Result<Url> {
    let parsed = Url::parse(value.trim()).map_err(|_| "请检查互传站点地址。")?;
    let trusted_scheme = parsed.scheme() == "https"
        || (parsed.scheme() == "http" && parsed.host_str() == Some("127.0.0.1"));
    if !trusted_scheme
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.fragment().is_some()
        || !matches!(parsed.path(), "/" | "/rooms")
    {
        return Err("请输入互传站点的 HTTPS 地址。".into());
    }
    Ok(parsed)
}

impl Invitation {
    fn parse(value: &str) -> Result<Self> {
        let parsed = station_url(value).map_err(|_| "请粘贴互传区的 HTTPS 邀请链接。")?;
        let mut params = parsed.query_pairs();
        let (name, code) = params.next().ok_or("邀请链接缺少邀请码。")?;
        if name != "code" || !hex(&code, 32) || params.next().is_some() {
            return Err("邀请码无效。".into());
        }
        let origin = Url::parse(&parsed.origin().ascii_serialization()).map_err(error)?;
        Ok(Self {
            origin,
            code: code.into_owned(),
        })
    }

    fn endpoint(&self, tail: &str) -> Result<Url> {
        self.origin
            .join(&format!("api/rooms/{0}{tail}", self.code))
            .map_err(error)
    }

    fn cookie_path(&self, state: &Runtime) -> PathBuf {
        cookie_path(&self.origin, state)
    }
}

fn cookie_path(origin: &Url, state: &Runtime) -> PathBuf {
    let hash = Sha256::digest(origin.as_str().as_bytes());
    state.data_root.join(format!("room-session-{hash:x}.bin"))
}

fn response_token(response: &Response) -> Option<String> {
    response
        .headers()
        .get(header::SET_COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .and_then(|value| value.strip_prefix("ningmao_room="))
        .filter(|value| hex(value, 48))
        .map(str::to_owned)
}

pub(crate) fn client() -> Result<Client> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    Client::builder()
        .no_proxy()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(error)
}

fn with_cookie(request: RequestBuilder, cookie: Option<String>) -> RequestBuilder {
    match cookie.filter(|value| hex(value, 48)) {
        Some(value) => request.header(header::COOKIE, format!("ningmao_room={value}")),
        None => request,
    }
}

pub(crate) async fn send(request: RequestBuilder) -> Result<Response> {
    request
        .send()
        .await
        .map_err(|_| "无法连接互传站点，请检查地址、网络和证书。".into())
}

async fn bounded(mut response: Response, limit: usize) -> Result<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|size| size > limit as u64)
    {
        return Err("站点回复超过容量限制。".into());
    }
    let mut out = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "传输中断，请核对任务后重试。")?
    {
        if chunk.len() > limit - out.len() {
            return Err("站点回复超过容量限制。".into());
        }
        out.extend_from_slice(&chunk);
    }
    Ok(out)
}

pub(crate) async fn reply(response: Response) -> Result<Value> {
    let status = response.status();
    let data: Value = serde_json::from_slice(&bounded(response, MAX_JSON).await?)
        .map_err(|_| "互传站点回复格式无效。")?;
    if status.is_success() {
        return Ok(data);
    }
    if status == 403
        && matches!(
            data["status"].as_str(),
            Some("pending" | "denied" | "left" | "removed")
        )
    {
        return Ok(data);
    }
    Err(data
        .as_str()
        .unwrap_or("站点拒绝了此操作。")
        .chars()
        .take(160)
        .collect())
}

#[tauri::command]
pub async fn room_create(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    station: String,
    name: String,
    approval: bool,
) -> Result<Value> {
    trusted_native_origin(&window)?;
    metadata_scope(&window)?;
    let address = station_url(&station)?;
    if address.query().is_some() {
        return Err("请输入站点地址。已有邀请请使用加入入口。".into());
    }
    let origin = Url::parse(&address.origin().ascii_serialization()).map_err(error)?;
    let state = app.state::<Runtime>();
    let _guard = state.rooms.joining.lock().await;
    let path = cookie_path(&origin, &state);
    let cookie = transfer_identity::read::<String>(&path)?.filter(|value| hex(value, 48));
    let response = send(
        with_cookie(
            client()?.post(origin.join("api/rooms").map_err(error)?),
            cookie.clone(),
        )
        .json(&json!({ "name": name, "approval": approval })),
    )
    .await?;
    let token = response_token(&response).or(cookie);
    let created = reply(response).await?;
    let code = created["code"]
        .as_str()
        .filter(|code| hex(code, 32))
        .ok_or("站点返回的邀请码无效。")?;
    let recovery = created["recovery"]
        .as_str()
        .filter(|code| hex(code, 48))
        .ok_or("站点返回的管理恢复码无效。")?;
    let token = token.ok_or("站点未返回群主授权。")?;
    transfer_identity::save(&path, &token)?;
    let mut invitation = origin.join("rooms").map_err(error)?;
    invitation.query_pairs_mut().append_pair("code", code);
    Ok(json!({ "invitation": invitation.as_str(), "recovery": recovery }))
}

#[tauri::command]
pub async fn room_join(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    invitation: String,
    name: String,
) -> Result<Value> {
    trusted_native_origin(&window)?;
    metadata_scope(&window)?;
    let invitation = Invitation::parse(&invitation)?;
    let state = app.state::<Runtime>();
    let _guard = state.rooms.joining.lock().await;
    let path = invitation.cookie_path(&state);
    let cookie = transfer_identity::read::<String>(&path)?;
    let response = send(
        with_cookie(client()?.post(invitation.endpoint("/join")?), cookie)
            .json(&json!({ "name": name })),
    )
    .await?;
    let token = response_token(&response);
    let result = reply(response).await?;
    if let Some(token) = token {
        transfer_identity::save(&path, &token)?;
    }
    Ok(result)
}

#[tauri::command]
pub async fn room_decide(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    invitation: String,
    member_id: String,
    accept: bool,
) -> Result<()> {
    trusted_native_origin(&window)?;
    metadata_scope(&window)?;
    let invitation = Invitation::parse(&invitation)?;
    if !hex(&member_id, 24) {
        return Err("成员编号无效。".into());
    }
    let cookie =
        transfer_identity::read::<String>(&invitation.cookie_path(&app.state::<Runtime>()))?;
    reply(
        send(
            with_cookie(client()?.post(invitation.endpoint("/decide")?), cookie)
                .json(&json!({ "id": member_id, "accept": accept })),
        )
        .await?,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn room_depart(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    invitation: String,
    member_id: Option<String>,
) -> Result<()> {
    trusted_native_origin(&window)?;
    metadata_scope(&window)?;
    let invitation = Invitation::parse(&invitation)?;
    let (endpoint, payload) = match member_id {
        Some(id) if hex(&id, 24) => ("/remove", json!({ "id": id })),
        Some(_) => return Err("成员编号无效。".into()),
        None => ("/leave", json!({})),
    };
    let cookie =
        transfer_identity::read::<String>(&invitation.cookie_path(&app.state::<Runtime>()))?;
    reply(
        send(with_cookie(client()?.post(invitation.endpoint(endpoint)?), cookie).json(&payload))
            .await?,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn room_view(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    invitation: String,
) -> Result<Value> {
    trusted_native_origin(&window)?;
    metadata_scope(&window)?;
    let invitation = Invitation::parse(&invitation)?;
    let cookie =
        transfer_identity::read::<String>(&invitation.cookie_path(&app.state::<Runtime>()))?;
    reply(send(with_cookie(client()?.get(invitation.endpoint("")?), cookie)).await?).await
}

#[tauri::command]
pub async fn room_upload(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    invitation: String,
    ticket: String,
    upload_id: String,
    expected: String,
) -> Result<Value> {
    trusted_native_origin(&window)?;
    let scope = metadata_scope(&window)?;
    let invitation = Invitation::parse(&invitation)?;
    if !hex(&upload_id, 32) || !hex(&expected, 64) {
        return Err("发送记录无效。".into());
    }
    let owner = window.label().to_string();
    let worker_app = app.clone();
    let (name, digest, data) = tauri::async_runtime::spawn_blocking(move || {
        let state = worker_app.state::<Runtime>();
        state
            .web_transfers
            .room_file(&ticket, &owner, scope, &state.store)
    })
    .await
    .map_err(error)??;
    if expected != digest {
        return Err("文件已变化，请重新选择。".into());
    }
    let cookie =
        transfer_identity::read::<String>(&invitation.cookie_path(&app.state::<Runtime>()))?;
    let escaped: String = name.bytes().map(|byte| format!("%{byte:02X}")).collect();
    reply(
        send(
            with_cookie(client()?.post(invitation.endpoint("/files")?), cookie)
                .header(header::CONTENT_TYPE, "application/octet-stream")
                .header("X-File-Name", escaped)
                .header("X-SHA256", digest)
                .header("X-Upload-Id", upload_id)
                .body(data),
        )
        .await?,
    )
    .await
}

#[tauri::command]
pub async fn room_download(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    invitation: String,
    file_id: String,
) -> Result<tauri::ipc::Response> {
    trusted_native_origin(&window)?;
    metadata_scope(&window)?;
    let invitation = Invitation::parse(&invitation)?;
    if !hex(&file_id, 32) {
        return Err("文件编号无效。".into());
    }
    let cookie =
        transfer_identity::read::<String>(&invitation.cookie_path(&app.state::<Runtime>()))?;
    let response = send(with_cookie(
        client()?.get(invitation.endpoint(&format!("/files/{file_id}"))?),
        cookie,
    ))
    .await?;
    if !response.status().is_success() {
        reply(response).await?;
        return Err("文件不可下载。".into());
    }
    Ok(tauri::ipc::Response::new(
        bounded(response, MAX_FILE).await?,
    ))
}

const ROOM_CHUNK: u64 = 4 * 1024 * 1024;
#[derive(Clone, serde::Serialize)]
pub struct RoomProgress {
    phase: &'static str,
    bytes: u64,
    total: u64,
}
fn progress(
    channel: &tauri::ipc::Channel<RoomProgress>,
    phase: &'static str,
    bytes: u64,
    total: u64,
) {
    let _ = channel.send(RoomProgress {
        phase,
        bytes,
        total,
    });
}

fn range_matches(response: &Response, start: u64, end: u64, total: u64) -> bool {
    response.status() == 206
        && response
            .headers()
            .get(header::CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value == format!("bytes {start}-{end}/{total}"))
}

#[tauri::command]
pub async fn room_bulk_receive(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    invitation: String,
    file_id: String,
    shelf_id: i64,
    ticket: String,
    on_progress: tauri::ipc::Channel<RoomProgress>,
) -> Result<()> {
    trusted_native_origin(&window)?;
    metadata_scope(&window)?;
    let invitation = Invitation::parse(&invitation)?;
    if !hex(&file_id, 32) {
        return Err("文件编号无效。".into());
    }
    let cookie =
        transfer_identity::read::<String>(&invitation.cookie_path(&app.state::<Runtime>()))?;
    let client = client()?;
    let manifest = reply(
        send(with_cookie(
            client.get(invitation.endpoint("")?),
            cookie.clone(),
        ))
        .await?,
    )
    .await?;
    let entry = manifest["files"]
        .as_array()
        .and_then(|files| {
            files.iter().find(|file| {
                file["id"].as_str() == Some(&file_id) && file["chunked"].as_u64() == Some(1)
            })
        })
        .ok_or("分块文件已撤回或到期。")?;
    let size = entry["size"].as_u64().ok_or("文件大小无效。")?;
    crate::web_transfer_receive::begin_room_receive(
        &app,
        &window,
        crate::web_transfer_receive::RoomReceive {
            shelf: shelf_id,
            ticket: ticket.clone(),
            size,
            name: entry["name"].as_str().ok_or("文件名无效。")?.to_owned(),
            digest: entry["digest"].as_str().ok_or("文件摘要无效。")?.to_owned(),
        },
    )
    .await?;
    let result = async {
        let url = invitation.endpoint(&format!("/files/{file_id}"))?;
        if size == 0 {
            let response = send(with_cookie(client.get(url.clone()), cookie.clone())).await?;
            if matches!(response.status().as_u16(), 404 | 410) {
                return Err("文件已撤回或到期。".into());
            }
            if !response.status().is_success() || !bounded(response, 0).await?.is_empty() {
                return Err("空文件不可下载。".into());
            }
        }
        let mut offset = 0;
        while offset < size {
            let end = (offset + ROOM_CHUNK).min(size) - 1;
            let fetch_block = || async {
                let response = send(
                    with_cookie(client.get(url.clone()), cookie.clone())
                        .header(header::RANGE, format!("bytes={offset}-{end}")),
                )
                .await?;
                if matches!(response.status().as_u16(), 404 | 410) {
                    return Ok(None);
                }
                if !range_matches(&response, offset, end, size) {
                    return Err("站点返回的文件范围不匹配。".into());
                }
                let expected = (end - offset + 1) as usize;
                let bytes = bounded(response, expected).await?;
                if bytes.len() != expected {
                    return Err("下载分块未收齐。".into());
                }
                Ok::<_, String>(Some(bytes))
            };
            let bytes = match fetch_block().await {
                Ok(bytes) => bytes,
                Err(_) => fetch_block().await?,
            }
            .ok_or("文件已撤回或到期。")?;
            crate::web_transfer_receive::append_room_bytes(&app, &window, &ticket, offset, bytes)
                .await?;
            offset = end + 1;
            progress(&on_progress, "下载", offset, size);
        }
        crate::web_transfer_receive::check_room_receive(&app, &window, &ticket)
    }
    .await;
    if result.is_err() {
        let _ = crate::web_transfer_receive::interrupt_room_receive(app, window, ticket).await;
    }
    result
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn room_bulk_upload(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    invitation: String,
    shelf_id: i64,
    item_id: i64,
    upload_id: String,
    recipients: Option<Vec<String>>,
    on_progress: tauri::ipc::Channel<RoomProgress>,
) -> Result<()> {
    use tokio::io::{AsyncReadExt, AsyncSeekExt};
    trusted_native_origin(&window)?;
    let scope = metadata_scope(&window)?;
    if scope.is_some_and(|id| id != shelf_id) || !hex(&upload_id, 32) {
        return Err("只能发送当前文件架的所选文件。".into());
    }
    let mut recipients = recipients;
    if let Some(ids) = recipients.as_mut() {
        if ids.is_empty() || ids.len() > 4 || ids.iter().any(|id| !hex(id, 24)) {
            return Err("请选择至多四位有效收件人。".into());
        }
        ids.sort_unstable();
        ids.dedup();
    }
    let invitation = Invitation::parse(&invitation)?;
    let worker = app.clone();
    let (name, source) = tauri::async_runtime::spawn_blocking(move || {
        let state = worker.state::<Runtime>();
        let store = state.store.lock().map_err(error)?;
        store.validate_item_scope(Some(shelf_id), &[item_id])?;
        let path = store.opening_target(item_id)?;
        store.validate_opening_target(item_id, &path)?;
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or("文件名称无效。")?
            .to_owned();
        Ok::<_, String>((name, crate::preview::open(&path)?))
    })
    .await
    .map_err(error)??;
    let mut source = tokio::fs::File::from_std(source);
    let size = source.metadata().await.map_err(error)?.len();
    if size > crate::web_transfer_receive::ROOM_MAX_BYTES {
        return Err("临时互传单文件最多 20 GB。".into());
    }
    let mut hash = Sha256::new();
    let mut part = vec![0; ROOM_CHUNK as usize];
    let mut checked = 0;
    while checked < size {
        let length = ROOM_CHUNK.min(size - checked) as usize;
        source
            .read_exact(&mut part[..length])
            .await
            .map_err(error)?;
        hash.update(&part[..length]);
        checked += length as u64;
        progress(&on_progress, "校验来源", checked, size);
    }
    let digest = format!("{:x}", hash.finalize());
    let request = format!("{:x}", Sha256::digest(format!("{upload_id}:{digest}")));
    let cookie =
        transfer_identity::read::<String>(&invitation.cookie_path(&app.state::<Runtime>()))?;
    let client = client()?;
    let start = reply(
        send(
            with_cookie(client.post(invitation.endpoint("/bulk")?), cookie.clone()).json(
                &json!({"name": name, "request": &request[..32], "size": size, "digest": digest,
                    "recipients": recipients}),
            ),
        )
        .await?,
    )
    .await?;
    if start["recipients"] != json!(recipients) {
        return Err("站点未确认发送范围，文件尚未上传。".into());
    }
    let id = start["id"]
        .as_str()
        .filter(|id| hex(id, 32))
        .ok_or("站点返回了无效文件编号。")?;
    let mut offset = start["offset"]
        .as_u64()
        .filter(|n| *n <= size && (*n == size || n % ROOM_CHUNK == 0))
        .ok_or("站点返回了无效上传偏移。")?;
    if start["size"].as_u64() != Some(size) || start["chunkBytes"].as_u64() != Some(ROOM_CHUNK) {
        return Err("站点返回了不匹配的分块参数。".into());
    }
    let tail = format!("/bulk/{id}");
    let url = invitation.endpoint(&tail)?;
    source
        .seek(std::io::SeekFrom::Start(offset))
        .await
        .map_err(error)?;
    while offset < size {
        let length = ROOM_CHUNK.min(size - offset) as usize;
        source
            .read_exact(&mut part[..length])
            .await
            .map_err(error)?;
        let digest = format!("{:x}", Sha256::digest(&part[..length]));
        let next = reply(
            send(
                with_cookie(client.post(url.clone()), cookie.clone())
                    .header("X-Offset", offset)
                    .header("X-SHA256", digest)
                    .body(part[..length].to_vec()),
            )
            .await?,
        )
        .await?;
        offset += length as u64;
        progress(&on_progress, "上传", offset, size);
        if next["offset"].as_u64() != Some(offset) || next["id"].as_str() != Some(id) {
            return Err("站点返回了不匹配的上传回执。".into());
        }
    }
    progress(&on_progress, "站点校验", size, size);
    let published = reply(
        send(with_cookie(
            client.post(invitation.endpoint(&format!("{tail}/publish"))?),
            cookie,
        ))
        .await?,
    )
    .await?;
    if published["id"].as_str() != Some(id) || published["expires"].as_u64().is_none() {
        return Err("站点尚未确认发布。".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invitation_only_accepts_exact_room_links() {
        let code = "0123456789abcdef0123456789abcdef";
        let valid = format!("https://example.test/rooms?code={code}");
        let invite = Invitation::parse(&valid).unwrap();
        assert_eq!(
            invite.endpoint("/join").unwrap().as_str(),
            format!("https://example.test/api/rooms/{code}/join")
        );
        for invalid in [
            format!("http://example.test/rooms?code={code}"),
            format!("https://user@example.test/rooms?code={code}"),
            format!("https://example.test/rooms?code={code}&code={code}"),
            format!("https://example.test/other?code={code}"),
        ] {
            assert!(Invitation::parse(&invalid).is_err());
        }
    }
}
