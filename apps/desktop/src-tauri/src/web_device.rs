//! W1 Windows device enrollment client. It redeems a one-use code by a native
//! HTTPS request; no Access cookie/JWT and no file ticket is sent to the cloud.
 //! Until DPAPI persistence and WSS integration are reviewed, the credential
//! remains in memory and is lost when the desktop exits.
use crate::{Runtime, error, store::Result};
use reqwest::{Url, redirect::Policy};
use serde::{Deserialize, Serialize};
use std::{
    net::IpAddr,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

#[derive(Default)]
pub struct WebDeviceControl {
    session: Mutex<Option<DeviceSession>>,
}
struct DeviceSession {
    device_id: String,
    name: String,
    endpoint: String,
    _token: String, // intentionally never returned to the renderer or written to disk
    expires_at: u64,
}
#[derive(Serialize)]
pub struct WebDeviceStatus {
    device_id: String,
    name: String,
    endpoint: String,
    expires_at: u64,
    authorized: bool,
}
#[derive(Deserialize)]
struct ClaimResult {
    token: String,
    expires_at: u64,
}
fn now_ms() -> Result<u64> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(error)?
        .as_millis() as u64)
}
fn validated_endpoint(raw: &str) -> Result<Url> {
    let parsed = Url::parse(raw.trim()).map_err(|_| "请输入有效的 HTTPS 网址")?;
    let host = parsed.host_str().ok_or("缺少服务域名")?;
    if parsed.scheme() != "https"
        || host.parse::<IpAddr>().is_ok()
        || !host.contains('.')
        || host.ends_with(".local")
        || host.ends_with(".localhost")
        || parsed.port().is_some()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || parsed.path() != "/"
    {
        return Err("仅允许完整的 HTTPS 域名，不接受 IP、本机地址、端口、路径或凭据".into());
    }
    Ok(parsed)
}
fn valid_pair_code(code: &str) -> bool {
    code.len() == 48
        && code.starts_with("nm1i_")
        && code[5..]
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
fn valid_device_token(token: &str) -> bool {
    token.len() == 48
        && token.starts_with("nm1t_")
        && token[5..]
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
fn guard(window: &tauri::WebviewWindow) -> Result<()> {
    crate::trusted_native_origin(window)?;
    if !matches!(window.label(), "main" | "manager") {
        return Err("只有工作站主窗口可授权 Windows 联网设备".into());
    }
    Ok(())
}
impl WebDeviceControl {
    fn status(&self) -> Result<Option<WebDeviceStatus>> {
        let current = now_ms()?;
        let mut stored = self.session.lock().map_err(error)?;
        if stored.as_ref().is_some_and(|v| v.expires_at <= current) {
            *stored = None;
        }
        Ok(stored.as_ref().map(|v| WebDeviceStatus {
            device_id: v.device_id.clone(),
            name: v.name.clone(),
            endpoint: v.endpoint.clone(),
            expires_at: v.expires_at,
            authorized: true,
        }))
    }
}
#[tauri::command]
pub async fn web_device_claim(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    base_url: String,
    code: String,
) -> Result<WebDeviceStatus> {
    guard(&window)?;
    if !valid_pair_code(&code) {
        return Err("一次性配对码格式不合法，请从受保护的柠猫网页复制".into());
    }
    let endpoint = validated_endpoint(&base_url)?;
    let device_id = uuid::Uuid::new_v4().to_string();
    let name = "柠猫 Windows 工作站".to_owned();
    let url = endpoint
        .join("device-link/claim")
        .map_err(|_| "服务地址不合法")?;
    let client = reqwest::Client::builder()
        .https_only(true)
        .redirect(Policy::none())
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(error)?;
    let result = client
        .post(url)
        .json(&serde_json::json!({"code":code,"device":{"id":device_id,"name":name}}))
        .send()
        .await
        .map_err(|_| "无法连接设备授权服务，请检查网址和网络")?;
    if !result.status().is_success() {
        return Err("配对失败：配对码可能已过期、已使用或授权服务未开启".into());
    }
    let body = result
        .json::<ClaimResult>()
        .await
        .map_err(|_| "服务器未返回有效设备会话")?;
    let current = now_ms()?;
    if !valid_device_token(&body.token)
        || body.expires_at <= current
        || body.expires_at > current + 24 * 60 * 60 * 1000 + 60_000
    {
        return Err("服务端返回的设备会话格式或有效期不合法".into());
    }
    let state = app.try_state::<Runtime>().ok_or("工作站未初始化")?;
    *state.web_device.session.lock().map_err(error)? = Some(DeviceSession {
        device_id,
        name,
        endpoint: endpoint.as_str().to_owned(),
        _token: body.token,
        expires_at: body.expires_at,
    });
    state.web_device.status()?.ok_or_else(|| "设备授权过期".into())
}
#[tauri::command]
pub fn web_device_status(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Option<WebDeviceStatus>> {
    guard(&window)?;
    app.try_state::<Runtime>()
        .ok_or("工作站未初始化")?
        .web_device
        .status()
}
#[tauri::command]
pub fn web_device_disconnect(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<()> {
    guard(&window)?;
    *app.try_state::<Runtime>()
        .ok_or("工作站未初始化")?
        .web_device
        .session
        .lock()
        .map_err(error)? = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deny_local_private_and_unstructured_endpoints() {
        for bad in [
            "http://example.com", "https://127.0.0.1", "https://localhost",
            "https://192.168.1.1", "https://example.local", "https://example.com:8443",
            "https://user:password@example.com", "https://example.com/other",
            "https://example.com/?x=1", "https://example.com/#secret",
        ] {
            assert!(validated_endpoint(bad).is_err(), "{bad}");
        }
        assert!(validated_endpoint("https://example.workers.dev/").is_ok());
    }
    #[test]
    fn pairing_code_and_token_never_accept_other_roles() {
        assert!(valid_pair_code(&format!("nm1i_{}", "x".repeat(43))));
        assert!(valid_device_token(&format!("nm1t_{}", "x".repeat(43))));
        assert!(!valid_pair_code(&format!("nm1t_{}", "x".repeat(43))));
        assert!(!valid_pair_code("fake_code"));
        assert!(!valid_device_token(&format!("nm1t_{}", "!".repeat(43))));
    }
}
