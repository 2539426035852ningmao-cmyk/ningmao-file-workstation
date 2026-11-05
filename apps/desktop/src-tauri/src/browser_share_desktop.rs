use crate::browser_share_process::{Connection, Outcome, SenderProgram};
use crate::{Runtime, error, metadata_scope, store::Result};
use sha2::{Digest, Sha256};
use std::{
    net::{SocketAddr, TcpStream},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};

struct LocalHosts(Vec<Child>, tempfile::TempDir);
impl Drop for LocalHosts {
    fn drop(&mut self) {
        for child in &mut self.0 {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
fn start_host(
    hosts: &mut LocalHosts,
    path: &str,
    hash: &str,
    args: &[&str],
    port: u16,
) -> Result<()> {
    let mut file = std::fs::File::open(path).map_err(|_| "浏览器服务组件不存在")?;
    let mut actual = Sha256::new();
    std::io::copy(&mut file, &mut actual).map_err(|_| "无法校验浏览器服务组件")?;
    if format!("{:x}", actual.finalize()) != hash.to_ascii_lowercase() {
        return Err("浏览器服务组件校验失败".into());
    }
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    if TcpStream::connect_timeout(&address, Duration::from_millis(100)).is_ok() {
        return Err("浏览器分享端口被占用，请结束旧测试服务后重试".into());
    }
    let mut command = Command::new(path);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    hosts
        .0
        .push(command.spawn().map_err(|_| "无法启动浏览器服务")?);
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(5) {
        if hosts
            .0
            .last_mut()
            .unwrap()
            .try_wait()
            .map_err(error)?
            .is_some()
        {
            return Err("浏览器服务启动失败，请检查端口或组件".into());
        }
        if TcpStream::connect_timeout(&address, Duration::from_millis(100)).is_ok() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    Err("浏览器服务启动超时，请重试".into())
}
fn hosts_available() -> bool {
    cfg!(debug_assertions)
        && option_env!("NINGMAO_PREVIEW_RELAY_PROGRAM").is_some()
        && option_env!("NINGMAO_PREVIEW_RELAY_SHA256").is_some()
        && option_env!("NINGMAO_PREVIEW_WEB_PROGRAM").is_some()
        && option_env!("NINGMAO_PREVIEW_WEB_SHA256").is_some()
}
fn local_hosts() -> Result<LocalHosts> {
    if !hosts_available() {
        return Err("此候选缺少浏览器服务组件配置".into());
    }
    let mut hosts = LocalHosts(
        Vec::new(),
        tempfile::tempdir().map_err(|_| "无法准备浏览器服务临时目录")?,
    );
    start_host(
        &mut hosts,
        option_env!("NINGMAO_PREVIEW_RELAY_PROGRAM").ok_or("缺少中继组件")?,
        option_env!("NINGMAO_PREVIEW_RELAY_SHA256").ok_or("缺少中继校验")?,
        &[
            "--pass",
            "ningmao-local-preview",
            "relay",
            "--host",
            "127.0.0.1",
            "--ports",
            "53318,53319,53320,53321,53322",
        ],
        53318,
    )?;
    let stored = hosts.1.path().to_string_lossy().into_owned();
    start_host(
        &mut hosts,
        option_env!("NINGMAO_PREVIEW_WEB_PROGRAM").ok_or("缺少网页组件")?,
        option_env!("NINGMAO_PREVIEW_WEB_SHA256").ok_or("缺少网页校验")?,
        &[
            "--pass",
            "ningmao-local-preview",
            "--relays",
            "127.0.0.1",
            "--ports",
            "53318,53319,53320,53321,53322",
            "--store-dir",
            &stored,
            "127.0.0.1:53323",
        ],
        53323,
    )?;
    Ok(hosts)
}

fn program() -> Result<SenderProgram> {
    if !cfg!(debug_assertions) {
        return Err("浏览器分享组件尚未发布".into());
    }
    let path = option_env!("NINGMAO_PREVIEW_SHARE_PROGRAM").ok_or("此候选未配置浏览器分享组件")?;
    let hash = option_env!("NINGMAO_PREVIEW_SHARE_SHA256").ok_or("分享组件缺少构建校验")?;
    if hash.len() != 64 {
        return Err("分享组件构建校验无效".into());
    }
    let mut sha256 = [0; 32];
    for (i, value) in sha256.iter_mut().enumerate() {
        *value =
            u8::from_str_radix(&hash[i * 2..i * 2 + 2], 16).map_err(|_| "分享组件构建校验无效")?;
    }
    Ok(SenderProgram {
        path: path.into(),
        sha256,
    })
}
#[tauri::command]
pub fn browser_share_available(window: tauri::WebviewWindow) -> Result<bool> {
    metadata_scope(&window)?;
    Ok(hosts_available() && program().is_ok_and(|program| program.path.is_file()))
}
#[tauri::command]
pub async fn browser_share_send(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
    ids: Vec<i64>,
    code: String,
) -> Result<Outcome> {
    let scope = metadata_scope(&window)?;
    if scope.is_some_and(|id| id != shelf_id) {
        return Err("此操作仅允许当前文件架".into());
    }
    if code.len() != 36
        || !code.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
    {
        return Err("分享代码无效".into());
    }
    let program = program()?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let session = state.browser_shares.begin()?;
        let _hosts = local_hosts()?;
        let result = session.run_items(
            &state.store,
            shelf_id,
            &ids,
            &program,
            &Connection {
                relay: "127.0.0.1:53318".into(),
                password: "ningmao-local-preview".into(),
                code,
            },
            |_| {
                let _ = app.emit("workstation-changed", ());
            },
        );
        let _ = app.emit("workstation-changed", ());
        result
    })
    .await
    .map_err(error)?
}
#[tauri::command]
pub fn browser_share_cancel(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<()> {
    let scope = metadata_scope(&window)?;
    let state = app.state::<Runtime>();
    let job = state
        .browser_shares
        .current_job()?
        .ok_or("分享尚在准备，请稍后停止或在任务中心取消")?;
    state
        .store
        .lock()
        .map_err(error)?
        .validate_job_scope(scope, job)?;
    state.browser_shares.cancel_job(job)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Requires pinned local Go relay and web binaries; opens loopback ports only"]
    fn real_hosts_are_owned_and_stop_when_share_scope_ends() {
        let relay = std::env::var("NINGMAO_TEST_RELAY").unwrap();
        let web = std::env::var("NINGMAO_TEST_WEB").unwrap();
        let hash = |path: &str| format!("{:x}", Sha256::digest(std::fs::read(path).unwrap()));
        let mut hosts = LocalHosts(Vec::new(), tempfile::tempdir().unwrap());
        assert!(start_host(&mut hosts, &relay, &"0".repeat(64), &[], 53318).is_err());
        assert!(hosts.0.is_empty());
        start_host(
            &mut hosts,
            &relay,
            &hash(&relay),
            &[
                "--pass",
                "ningmao-local-preview",
                "relay",
                "--host",
                "127.0.0.1",
                "--ports",
                "53318,53319,53320,53321,53322",
            ],
            53318,
        )
        .unwrap();
        let stored = hosts.1.path().to_path_buf();
        start_host(
            &mut hosts,
            &web,
            &hash(&web),
            &[
                "--pass",
                "ningmao-local-preview",
                "--relays",
                "127.0.0.1",
                "--ports",
                "53318,53319,53320,53321,53322",
                "--store-dir",
                stored.to_str().unwrap(),
                "127.0.0.1:53323",
            ],
            53323,
        )
        .unwrap();
        assert_eq!(hosts.0.len(), 2);
        drop(hosts);
        assert!(!stored.exists());
        for port in 53318..=53323 {
            assert!(
                TcpStream::connect_timeout(
                    &SocketAddr::from(([127, 0, 0, 1], port)),
                    Duration::from_millis(100)
                )
                .is_err()
            );
        }
    }
}
