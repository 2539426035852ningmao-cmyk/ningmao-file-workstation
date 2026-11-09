//! W1 Windows device enrollment client. It redeems a one-use code by a native
//! HTTPS request; no Access cookie/JWT and no file ticket is sent to the cloud.
//! Until DPAPI persistence and WSS integration are reviewed, the credential
//! remains in memory and is lost when the desktop exits.
use crate::{Runtime, error, store::Result};
use futures_util::{SinkExt, StreamExt};
use reqwest::{Url, redirect::Policy};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    net::IpAddr,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;
use tauri::Manager;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{Message, client::IntoClientRequest},
};

#[derive(Default)]
pub struct WebDeviceControl {
    session: Mutex<Option<DeviceSession>>,
    socket: Mutex<Option<SignalRunner>>,
    generation: Arc<AtomicU64>,
    online: Arc<AtomicBool>,
    peers: Arc<Mutex<Vec<OnlinePeer>>>,
}
struct SignalRunner(tokio::task::JoinHandle<()>);
impl Drop for SignalRunner {
    fn drop(&mut self) {
        self.0.abort();
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct OnlinePeer {
    id: String,
    name: String,
}

struct DeviceSession {
    device_id: String,
    name: String,
    endpoint: String,
    token: String, // never returned to the renderer or written to disk
    expires_at: u64,
}
#[derive(Serialize)]
pub struct WebDeviceStatus {
    device_id: String,
    name: String,
    endpoint: String,
    expires_at: u64,
    authorized: bool,
    signal_online: bool,
    online_devices: Vec<OnlinePeer>,
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
    fn stop_socket(&self) -> Result<()> {
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.online.store(false, Ordering::SeqCst);
        self.peers.lock().map_err(error)?.clear();
        self.socket.lock().map_err(error)?.take();
        Ok(())
    }
    fn status(&self) -> Result<Option<WebDeviceStatus>> {
        let current = now_ms()?;
        let mut stored = self.session.lock().map_err(error)?;
        if stored.as_ref().is_some_and(|v| v.expires_at <= current) {
            *stored = None;
            self.stop_socket()?;
        }
        let peers = self.peers.lock().map_err(error)?.clone();
        Ok(stored.as_ref().map(|v| WebDeviceStatus {
            device_id: v.device_id.clone(),
            name: v.name.clone(),
            endpoint: v.endpoint.clone(),
            expires_at: v.expires_at,
            authorized: true,
            signal_online: self.online.load(Ordering::SeqCst),
            online_devices: peers,
        }))
    }
}
impl Drop for WebDeviceControl {
    fn drop(&mut self) {
        if let Ok(mut running) = self.socket.lock() {
            running.take();
        }
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
    state.web_device.stop_socket()?;
    *state.web_device.session.lock().map_err(error)? = Some(DeviceSession {
        device_id,
        name,
        endpoint: endpoint.as_str().to_owned(),
        token: body.token,
        expires_at: body.expires_at,
    });
    state
        .web_device
        .status()?
        .ok_or_else(|| "设备授权过期".into())
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
pub fn web_device_disconnect(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<()> {
    guard(&window)?;
    let state = app.try_state::<Runtime>().ok_or("工作站未初始化")?;
    state.web_device.stop_socket()?;
    *state.web_device.session.lock().map_err(error)? = None;
    let _ = app.emit("web-device-connection", json!({"connected":false}));
    Ok(())
}

/// Windows-native signaling: only presence is reported to the renderer.
/// Until the W2 RTC layer is wired, all incoming file invites are explicitly
/// declined rather than accidentally accepted or silently left pending.
#[tauri::command]
pub async fn web_device_connect(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<WebDeviceStatus> {
    guard(&window)?;
    let state = app.try_state::<Runtime>().ok_or("工作站未初始化")?;
    let (device_id, endpoint, token, expires_at) = {
        let stored = state.web_device.session.lock().map_err(error)?;
        let session = stored.as_ref().ok_or("请先完成 Windows 设备授权")?;
        (
            session.device_id.clone(),
            session.endpoint.clone(),
            session.token.clone(),
            session.expires_at,
        )
    };
    if now_ms()? >= expires_at {
        return Err("Windows 授权已过期，请重新配对".into());
    }
    let base = validated_endpoint(&endpoint)?;
    let mut url = base.join("device-link/connect").map_err(error)?;
    url.set_scheme("wss").map_err(|_| "信令连接地址无效")?;
    url.query_pairs_mut().append_pair("device", &device_id);
    let mut request = url
        .as_str()
        .into_client_request()
        .map_err(|_| "无法创建安全信令请求")?;
    let bearer = format!("Bearer {token}");
    request.headers_mut().insert(
        "Authorization",
        bearer.parse().map_err(|_| "设备授权凭据格式无效")?,
    );
    state.web_device.stop_socket()?;
    let generation = state.web_device.generation.load(Ordering::SeqCst);
    let connection = tokio::time::timeout(Duration::from_secs(15), connect_async(request))
        .await
        .map_err(|_| "信令连接超时")?
        .map_err(|_| "信令连接失败，可能是 Access 配置、凭据或网络不可用")?;
    // Cancellation or a newly issued code during the handshake must invalidate
    // this socket, including if it authenticated successfully.
    if state.web_device.generation.load(Ordering::SeqCst) != generation
        || !state
            .web_device
            .session
            .lock()
            .map_err(error)?
            .as_ref()
            .is_some_and(|s| s.device_id == device_id && s.token == token)
    {
        return Err("Windows 设备授权已更新，丢弃过期连接".into());
    }
    // Hold the socket slot while installing this connection. Disconnect/re-pair
    // advances the generation before taking the same lock, so no stale task
    // may be published as online after a local revocation.
    let mut socket_slot = state.web_device.socket.lock().map_err(error)?;
    if state.web_device.generation.load(Ordering::SeqCst) != generation {
        return Err("Windows 设备已断开，未启动过期信令连接".into());
    }
    state.web_device.online.store(true, Ordering::SeqCst);
    let (mut sink, mut source) = connection.0.split();
    let online = state.web_device.online.clone();
    let peers = state.web_device.peers.clone();
    let current_gen = state.web_device.generation.clone();
    let app2 = app.clone();
    let self_id = device_id.clone();
    let task = tokio::spawn(async move {
        let mut heart = tokio::time::interval(Duration::from_secs(25));
        loop {
            if current_gen.load(Ordering::SeqCst) != generation {
                break;
            }
            tokio::select! {
                _=heart.tick()=>{
                    if now_ms().unwrap_or(u64::MAX)>=expires_at{break;}
                    if sink.send(Message::Text(r#"{"type":"ping"}"#.into())).await.is_err(){break;}
                }
                next=source.next()=>{
                    let raw=match next {
                        Some(Ok(Message::Text(raw))) if raw.len()<=16_384=>raw,
                        Some(Ok(Message::Ping(payload)))=>{
                            if sink.send(Message::Pong(payload)).await.is_err(){break;}
                            continue;
                        }
                        Some(Ok(Message::Close(_)))|None|Some(Err(_))=>break,
                        Some(Ok(_))=>continue,
                    };
                    let Ok(value)=serde_json::from_str::<Value>(&raw) else {continue;};
                    if value.get("type").and_then(Value::as_str)==Some("presence") {
                        let devices=value.get("devices").and_then(Value::as_array)
                            .map(|list|list.iter().take(8).filter_map(|peer|{
                                let id=peer.get("id")?.as_str()?;
                                let name=peer.get("name")?.as_str()?;
                                if id==self_id || uuid::Uuid::parse_str(id).is_err()
                                    || name.is_empty() || name.len()>80{return None;}
                                Some(OnlinePeer{id:id.to_owned(),name:name.to_owned()})
                            }).collect::<Vec<_>>()).unwrap_or_default();
                        if let Ok(mut current)=peers.lock(){*current=devices.clone();}
                        let _=app2.emit("web-device-presence",&devices);
                    }else if value.get("type").and_then(Value::as_str)==Some("invite"){
                        // W2 is not yet connected: do not leave the other sender hanging.
                        let sender=value.get("from").and_then(Value::as_str);
                        let task_id=value.get("payload").and_then(|v|v.get("id")).and_then(Value::as_str);
                        if let (Some(sender),Some(task_id))=(sender,task_id)
                            && uuid::Uuid::parse_str(sender).is_ok()
                            && uuid::Uuid::parse_str(task_id).is_ok() {
                            let decline=json!({"type":"decision","to":sender,"payload":{"id":task_id,"accepted":false}});
                            if sink.send(Message::Text(decline.to_string().into())).await.is_err(){break;}
                            let _=app2.emit("web-device-invite-declined",());
                        }
                    }
                }
            }
        }
        if current_gen.load(Ordering::SeqCst) == generation {
            online.store(false, Ordering::SeqCst);
            if let Ok(mut list) = peers.lock() {
                list.clear();
            }
            let _ = app2.emit("web-device-connection", json!({"connected":false}));
        }
    });
    *socket_slot = Some(SignalRunner(task));
    drop(socket_slot);
    let _ = app.emit("web-device-connection", json!({"connected":true}));
    state
        .web_device
        .status()?
        .ok_or_else(|| "设备授权已失效".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deny_local_private_and_unstructured_endpoints() {
        for bad in [
            "http://example.com",
            "https://127.0.0.1",
            "https://localhost",
            "https://192.168.1.1",
            "https://example.local",
            "https://example.com:8443",
            "https://user:password@example.com",
            "https://example.com/other",
            "https://example.com/?x=1",
            "https://example.com/#secret",
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
