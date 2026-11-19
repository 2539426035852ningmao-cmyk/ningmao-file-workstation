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

fn hex(value: &str, size: usize) -> bool {
    value.len() == size
        && value
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

impl Invitation {
    fn parse(value: &str) -> Result<Self> {
        let parsed = Url::parse(value.trim()).map_err(|_| "邀请链接无效。")?;
        let trusted_scheme = parsed.scheme() == "https"
            || (parsed.scheme() == "http" && parsed.host_str() == Some("127.0.0.1"));
        if !trusted_scheme
            || !parsed.username().is_empty()
            || parsed.password().is_some()
            || parsed.fragment().is_some()
            || !matches!(parsed.path(), "/" | "/rooms")
        {
            return Err("请粘贴互传区的 HTTPS 邀请链接。".into());
        }
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
        let hash = Sha256::digest(self.origin.as_str().as_bytes());
        state.data_root.join(format!("room-session-{hash:x}.bin"))
    }
}

fn client() -> Result<Client> {
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

async fn send(request: RequestBuilder) -> Result<Response> {
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

async fn reply(response: Response) -> Result<Value> {
    let status = response.status();
    let data: Value = serde_json::from_slice(&bounded(response, MAX_JSON).await?)
        .map_err(|_| "互传站点回复格式无效。")?;
    if status.is_success() {
        return Ok(data);
    }
    if status == 403 && matches!(data["status"].as_str(), Some("pending" | "denied")) {
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
    let token = response
        .headers()
        .get(header::SET_COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .and_then(|value| value.strip_prefix("ningmao_room="))
        .filter(|value| hex(value, 48))
        .map(str::to_owned);
    let result = reply(response).await?;
    if let Some(token) = token {
        transfer_identity::save(&path, &token)?;
    }
    Ok(result)
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
