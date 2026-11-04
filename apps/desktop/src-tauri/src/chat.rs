use crate::store::{ChatConfig, PromptMessage, Result};
use reqwest::{Url, redirect::Policy};
use serde_json::{Value, json};
use std::{
    net::{IpAddr, SocketAddr},
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::Notify;

pub fn endpoint(base: &str) -> Result<Url> {
    let mut url = Url::parse(base).map_err(|_| "请填写有效的模型服务地址")?;
    let host = url.host_str().ok_or("模型服务缺少主机名")?;
    let local = matches!(host, "localhost" | "127.0.0.1" | "[::1]");
    if !(url.scheme() == "https" || (local && url.scheme() == "http"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "服务地址仅支持 HTTPS，或明确配置的 localhost HTTP；不允许账号、查询和片段".into(),
        );
    }
    let path = format!("{}/chat/completions", url.path().trim_end_matches('/'));
    url.set_path(&path);
    Ok(url)
}
fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            !(v.is_private()
                || v.is_loopback()
                || v.is_link_local()
                || v.is_unspecified()
                || v.is_multicast()
                || v.is_broadcast()
                || v.octets()[0] == 0)
        }
        IpAddr::V6(v) => {
            !(v.is_loopback()
                || v.is_unspecified()
                || v.is_multicast()
                || v.is_unique_local()
                || v.is_unicast_link_local()
                || v.to_ipv4_mapped()
                    .is_some_and(|v| !public_ip(IpAddr::V4(v))))
        }
    }
}

type SharedChat = Arc<Mutex<Option<(i64, Arc<Notify>)>>>;
#[derive(Default)]
pub struct ChatControl(SharedChat);
pub struct ActiveChat {
    shared: SharedChat,
    pub cancel: Arc<Notify>,
}
impl ChatControl {
    pub fn start(&self, session: i64) -> Result<ActiveChat> {
        let mut active = self.0.lock().map_err(|_| "对话状态不可用")?;
        if active.is_some() {
            return Err("请先等待或停止当前回复".into());
        }
        let cancel = Arc::new(Notify::new());
        *active = Some((session, cancel.clone()));
        Ok(ActiveChat {
            shared: self.0.clone(),
            cancel,
        })
    }
    pub fn idle(&self) -> Result<()> {
        if self.0.lock().map_err(|_| "对话状态不可用")?.is_some() {
            Err("请先停止当前回复".into())
        } else {
            Ok(())
        }
    }
    pub fn stop(&self, session: i64) -> Result<()> {
        if let Some((id, notify)) = self.0.lock().map_err(|_| "对话状态不可用")?.as_ref()
            && *id == session
        {
            notify.notify_one();
        }
        Ok(())
    }
}
impl Drop for ActiveChat {
    fn drop(&mut self) {
        if let Ok(mut active) = self.shared.lock() {
            *active = None;
        }
    }
}

pub async fn stream_reply(
    config: &ChatConfig,
    key: Option<&str>,
    messages: &[PromptMessage],
    cancel: &Notify,
    output: &mut String,
    mut update: impl FnMut(&str) -> Result<()>,
) -> Result<&'static str> {
    let url = endpoint(&config.base_url)?;
    let host = url.host_str().ok_or("模型地址无效")?;
    let local = matches!(host, "localhost" | "127.0.0.1" | "[::1]");
    let port = url.port_or_known_default().ok_or("模型地址端口无效")?;
    let addresses: Vec<SocketAddr> = if local {
        vec![SocketAddr::new(
            if host == "[::1]" {
                "::1".parse().unwrap()
            } else {
                "127.0.0.1".parse().unwrap()
            },
            port,
        )]
    } else {
        tokio::select! {_=cancel.notified()=>return Ok("stopped"), resolved=tokio::time::timeout(Duration::from_secs(10),tokio::net::lookup_host((host,port)))=>resolved.map_err(|_|"模型服务地址解析超时")?.map_err(|_|"无法解析模型服务地址")?.collect()}
    };
    if addresses.is_empty() || (!local && addresses.iter().any(|a| !public_ip(a.ip()))) {
        return Err("远程模型服务不能连接本机或内网地址".into());
    }
    let _ = rustls::crypto::ring::default_provider().install_default();
    let client = reqwest::Client::builder()
        .redirect(Policy::none())
        .no_proxy()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120))
        .resolve_to_addrs(host, &addresses)
        .build()
        .map_err(|_| "无法创建模型连接")?;
    let mut request = client
        .post(url)
        .json(&json!({"model":config.model,"messages":messages,"stream":true}));
    if let Some(key) = key {
        request = request.bearer_auth(key);
    }
    let response = tokio::select! { _=cancel.notified()=>return Ok("stopped"),response=request.send()=>response.map_err(|_|"模型服务连接失败或超时，请检查地址、网络和配置")? };
    let code = response.status();
    if !code.is_success() {
        return Err(match code.as_u16() {
            401 | 403 => "模型服务拒绝授权，请检查密钥或权限".into(),
            429 => "模型服务额度或请求频率受限".into(),
            _ => format!("模型服务返回 HTTP {}", code.as_u16()),
        });
    }
    let mut response = response;
    let mut pending = Vec::new();
    let mut last = std::time::Instant::now();
    let mut total = 0usize;
    let mut done = false;
    loop {
        let chunk = tokio::select! { _=cancel.notified()=>return Ok("stopped"),chunk=response.chunk()=>chunk.map_err(|_|"模型回复中断")? };
        let Some(chunk) = chunk else {
            break;
        };
        total += chunk.len();
        if total > 2 * 1024 * 1024 {
            return Err("模型回复超过本次长度限制".into());
        }
        pending.extend_from_slice(&chunk);
        while let Some(end) = pending.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = pending.drain(..=end).collect();
            let line = std::str::from_utf8(&line)
                .map_err(|_| "模型回复编码无效")?
                .trim();
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data == "[DONE]" {
                done = true;
                break;
            }
            let value: Value = serde_json::from_str(data).map_err(|_| "模型流式回复格式无效")?;
            if value.get("error").is_some() {
                return Err("模型服务返回错误，请检查配置与额度".into());
            }
            if let Some(content) = value["choices"][0]["delta"]["content"].as_str() {
                output.push_str(content);
            }
        }
        if last.elapsed() >= Duration::from_millis(100) {
            update(output)?;
            last = std::time::Instant::now();
        }
        if done {
            break;
        }
    }
    if !done || output.is_empty() {
        return Err("模型未返回完整文字回复".into());
    }
    Ok("completed")
}

pub async fn test_connection(
    config: &ChatConfig,
    key: Option<&str>,
    cancel: &Notify,
) -> Result<()> {
    let messages = [PromptMessage {
        role: "user".into(),
        content: "Reply with OK.".into(),
    }];
    let mut output = String::new();
    match stream_reply(config, key, &messages, cancel, &mut output, |_| Ok(())).await? {
        "completed" => Ok(()),
        _ => Err("模型测试已停止".into()),
    }
}

#[cfg(windows)]
fn crypt(bytes: &[u8], encrypt: bool) -> Result<Vec<u8>> {
    use windows::Win32::{
        Foundation::{HLOCAL, LocalFree},
        Security::Cryptography::{
            CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData,
        },
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        let result = if encrypt {
            CryptProtectData(
                &input,
                windows::core::PCWSTR::null(),
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        result.map_err(|_| "Windows 无法读取或保护密钥，请在此账号重新配置")?;
        let result = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
        Ok(result)
    }
}
pub fn protect(bytes: &[u8]) -> Result<Vec<u8>> {
    #[cfg(windows)]
    {
        crypt(bytes, true)
    }
    #[cfg(not(windows))]
    {
        let _ = bytes;
        Err("此版本的密钥安全保存仅支持 Windows".into())
    }
}
pub fn unprotect(bytes: &[u8]) -> Result<Vec<u8>> {
    #[cfg(windows)]
    {
        crypt(bytes, false)
    }
    #[cfg(not(windows))]
    {
        let _ = bytes;
        Err("此版本的密钥安全读取仅支持 Windows".into())
    }
}
