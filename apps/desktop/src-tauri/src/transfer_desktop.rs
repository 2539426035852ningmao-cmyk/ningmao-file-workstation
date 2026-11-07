use crate::{
    Runtime, error, metadata_scope,
    store::Result,
    transfer_runtime::TransferRuntime,
    transfer_sender::{
        LocalhostTransferClient, SendFile, SendProgress, SendResult, send_open_files,
    },
};
use ningmao_transfer_receiver::{IncomingBatch, Receiver};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::OpenOptions,
    net::SocketAddrV4,
    path::Path,
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};

struct ActiveReceiver {
    receiver: Receiver,
    fingerprint: String,
    shelf: i64,
    _advertisement: Option<crate::transfer_discovery::Advertisement>,
}
struct Sending {
    shelf: i64,
    job: Option<i64>,
    cancel: Arc<AtomicBool>,
}
#[derive(Default)]
pub struct TransferControl {
    receiver: Mutex<Option<ActiveReceiver>>,
    sending: Mutex<Option<Sending>>,
    pending: Mutex<Option<(i64, IncomingBatch, Option<bool>)>>,
    answer: Condvar,
    events: Mutex<(TransferRuntime, HashSet<i64>, i64)>,
}
#[derive(Serialize)]
pub struct TransferView {
    receiving: bool,
    address: Option<String>,
    fingerprint: Option<String>,
    shelf_id: Option<i64>,
    pending: Option<IncomingBatch>,
    sending: bool,
}
fn require_scope(scope: Option<i64>, shelf: i64) -> Result<()> {
    if scope.is_some_and(|id| id != shelf) {
        Err("此操作仅允许当前文件架。".into())
    } else {
        Ok(())
    }
}
fn changed(app: &tauri::AppHandle) {
    let _ = app.emit("transfer-changed", ());
    let _ = app.emit("workstation-changed", ());
}

#[tauri::command]
pub fn transfer_view(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<TransferView> {
    let scope = metadata_scope(&window)?;
    let state = app.state::<Runtime>();
    let receiver = state.transfers.receiver.lock().map_err(error)?;
    let active = receiver
        .as_ref()
        .filter(|receiver| scope.is_none_or(|id| id == receiver.shelf));
    let pending = state
        .transfers
        .pending
        .lock()
        .map_err(error)?
        .as_ref()
        .filter(|(shelf, _, _)| scope.is_none_or(|id| id == *shelf))
        .map(|(_, batch, _)| batch.clone());
    let sending = state
        .transfers
        .sending
        .lock()
        .map_err(error)?
        .as_ref()
        .is_some_and(|sending| scope.is_none_or(|id| id == sending.shelf));
    Ok(TransferView {
        receiving: active.is_some(),
        address: active.map(|receiver| receiver.receiver.address.to_string()),
        fingerprint: active.map(|receiver| receiver.fingerprint.clone()),
        shelf_id: active.map(|receiver| receiver.shelf),
        pending,
        sending,
    })
}

#[tauri::command]
pub async fn transfer_receive(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
    bind_address: String,
) -> Result<()> {
    let scope = metadata_scope(&window)?;
    require_scope(scope, shelf_id)?;
    let bind_address = if bind_address.trim().is_empty() {
        crate::transfer_discovery::local_address()
            .map_err(|_| "未找到局域网，请连接 Wi-Fi 或在手动设置中填写地址。")?
            .to_string()
    } else {
        bind_address
    };
    let address: SocketAddrV4 = bind_address
        .parse()
        .map_err(|_| "请输入本机 IPv4 地址和端口，例如 192.168.1.2:53317。")?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let mut receiver = state.transfers.receiver.lock().map_err(error)?;
        if receiver.is_some() {
            return Err("请先关闭当前接收。".into());
        }
        let root = state
            .store
            .lock()
            .map_err(error)?
            .shelf(shelf_id)?
            .root
            .ok_or("请选择已绑定的真实文件夹。")?;
        let certificate = rcgen::generate_simple_self_signed(vec!["localhost".into()])
            .map_err(|_| "无法创建设备证书。")?;
        let fingerprint = format!("{:x}", Sha256::digest(certificate.cert.der()));
        let config = rustls::ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(
                vec![certificate.cert.der().clone()],
                rustls::pki_types::PrivatePkcs8KeyDer::from(
                    certificate.signing_key.serialize_der(),
                )
                .into(),
            )
            .map_err(|_| "无法配置设备证书。")?;
        *state.transfers.events.lock().map_err(error)? =
            (TransferRuntime::default(), HashSet::new(), shelf_id);
        let journal_app = app.clone();
        let journal: ningmao_transfer_receiver::tasks::Journal = Arc::new(move |event| {
            let state = journal_app.state::<Runtime>();
            let mut events = state.transfers.events.lock().map_err(|_| "transfer lock")?;
            let mut store = state.store.lock().map_err(|_| "store lock")?;
            if let Some(progress) = events.0.accept_event(&mut store, shelf_id, event)? {
                if progress.phase.terminal() {
                    events.1.remove(&progress.job_id);
                } else {
                    events.1.insert(progress.job_id);
                }
            }
            drop(store);
            drop(events);
            changed(&journal_app);
            Ok(())
        });
        let confirm_app = app.clone();
        let confirm: ningmao_transfer_receiver::Confirmation = Arc::new(move |batch, stopping| {
            let state = confirm_app.state::<Runtime>();
            let Ok(mut pending) = state.transfers.pending.lock() else {
                return false;
            };
            *pending = Some((shelf_id, batch.clone(), None));
            let _ = confirm_app.emit("transfer-changed", ());
            let start = Instant::now();
            while pending
                .as_ref()
                .is_some_and(|(_, _, answer)| answer.is_none())
                && !stopping.load(Ordering::SeqCst)
                && start.elapsed() < Duration::from_secs(60)
            {
                let Ok(wait) = state
                    .transfers
                    .answer
                    .wait_timeout(pending, Duration::from_millis(100))
                else {
                    return false;
                };
                pending = wait.0;
            }
            let accept = pending
                .take()
                .and_then(|(_, _, answer)| answer)
                .unwrap_or(false);
            let _ = confirm_app.emit("transfer-changed", ());
            accept
        });
        let started = Receiver::start(
            address,
            Path::new(&root),
            Arc::new(config),
            journal,
            confirm,
        )
        .map_err(|_| "无法开启接收，请检查本机地址、端口和绑定目录。")?;
        let advertisement = if address.ip().is_private() {
            let name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "柠猫电脑".into());
            Some(
                crate::transfer_discovery::Advertisement::start(
                    crate::transfer_discovery::Device {
                        name: name.chars().take(64).collect(),
                        address: started.address,
                        fingerprint: fingerprint.clone(),
                    },
                )
                .map_err(|_| "设备发现端口不可用，请关闭占用该端口的柠猫测试程序后重试。")?,
            )
        } else {
            None
        };
        *receiver = Some(ActiveReceiver {
            _advertisement: advertisement,
            receiver: started,
            fingerprint,
            shelf: shelf_id,
        });
        drop(receiver);
        changed(&app);
        Ok(())
    })
    .await
    .map_err(error)?
}

#[tauri::command]
pub fn transfer_decide(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
    accept: bool,
) -> Result<()> {
    let scope = metadata_scope(&window)?;
    let state = app.state::<Runtime>();
    let mut pending = state.transfers.pending.lock().map_err(error)?;
    let (shelf, batch, answer) = pending.as_mut().ok_or("接收请求已结束。")?;
    require_scope(scope, *shelf)?;
    if batch.id != id {
        return Err("接收请求已变化，请重新确认。".into());
    }
    *answer = Some(accept);
    state.transfers.answer.notify_all();
    Ok(())
}

#[tauri::command]
pub async fn transfer_stop_receive(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<()> {
    let scope = metadata_scope(&window)?;
    tauri::async_runtime::spawn_blocking(move || stop_receiver(&app, scope))
        .await
        .map_err(error)?
}
fn stop_receiver(app: &tauri::AppHandle, scope: Option<i64>) -> Result<()> {
    let state = app.state::<Runtime>();
    let receiver = {
        let mut receiver = state.transfers.receiver.lock().map_err(error)?;
        if let Some(active) = receiver.as_ref() {
            require_scope(scope, active.shelf)?;
        }
        receiver.take()
    };
    if let Some(active) = receiver {
        active
            .receiver
            .stop()
            .map_err(|_| "接收停止异常，请核对任务记录。")?;
    }
    changed(app);
    Ok(())
}

#[tauri::command]
pub async fn transfer_send(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
    ids: Vec<i64>,
    address: String,
    fingerprint: String,
) -> Result<SendResult> {
    let scope = metadata_scope(&window)?;
    require_scope(scope, shelf_id)?;
    if ids.is_empty() || ids.len() > 16 {
        return Err("请选择 1–16 个普通文件。".into());
    }
    let address: SocketAddrV4 = address
        .parse()
        .map_err(|_| "请输入接收设备的 IPv4 地址和端口。")?;
    let client = LocalhostTransferClient::pinned(address, &fingerprint)
        .map_err(|_| "设备地址或证书指纹无效。")?;
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let state = app.state::<Runtime>();
        let mut sending = state.transfers.sending.lock().map_err(error)?;
        if sending.is_some() {
            return Err("请先完成或取消当前发送。".into());
        }
        *sending = Some(Sending {
            shelf: shelf_id,
            job: None,
            cancel: cancel.clone(),
        });
    }
    changed(&app);
    let worker_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let state = worker_app.state::<Runtime>();
        let paths = {
            let store = state.store.lock().map_err(error)?;
            store.validate_item_scope(Some(shelf_id), &ids)?;
            ids.iter()
                .map(|id| store.opening_target(*id))
                .collect::<Result<Vec<_>>>()?
        };
        let mut files = paths
            .iter()
            .map(|path| {
                let mut options = OpenOptions::new();
                options.read(true);
                #[cfg(windows)]
                {
                    use std::os::windows::fs::OpenOptionsExt;
                    options.share_mode(1).custom_flags(0x00200000);
                }
                options
                    .open(path)
                    .map_err(|_| "文件被占用或无法安全读取。".to_string())
            })
            .collect::<Result<Vec<_>>>()?;
        let names = paths
            .iter()
            .map(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .ok_or("文件名无法发送。")
                    .map(str::to_owned)
            })
            .collect::<std::result::Result<Vec<_>, _>>()?;
        let mut sources = files
            .iter_mut()
            .zip(&names)
            .map(|(source, name)| SendFile { source, name })
            .collect::<Vec<_>>();
        send_open_files(
            &state.store,
            shelf_id,
            &client,
            &mut sources,
            &cancel,
            |event: &SendProgress| {
                if let Ok(mut sending) = state.transfers.sending.lock()
                    && let Some(sending) = sending.as_mut()
                {
                    sending.job = Some(event.job_id);
                }
                let _ = worker_app.emit("transfer-progress", event);
                changed(&worker_app);
            },
        )
    })
    .await
    .map_err(error)
    .and_then(|result| result);
    app.state::<Runtime>()
        .transfers
        .sending
        .lock()
        .map_err(error)?
        .take();
    changed(&app);
    result
}

#[tauri::command]
pub fn transfer_cancel_send(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<()> {
    let scope = metadata_scope(&window)?;
    let state = app.state::<Runtime>();
    if let Some(sending) = state.transfers.sending.lock().map_err(error)?.as_ref() {
        require_scope(scope, sending.shelf)?;
        sending.cancel.store(true, Ordering::SeqCst);
    }
    Ok(())
}
pub fn cancel_job(app: &tauri::AppHandle, scope: Option<i64>, job: i64) -> Result<bool> {
    let state = app.state::<Runtime>();
    if let Some(sending) = state.transfers.sending.lock().map_err(error)?.as_ref()
        && sending.job == Some(job)
    {
        require_scope(scope, sending.shelf)?;
        sending.cancel.store(true, Ordering::SeqCst);
        return Ok(true);
    }
    let belongs = {
        let events = state.transfers.events.lock().map_err(error)?;
        if events.1.contains(&job) {
            require_scope(scope, events.2)?;
            true
        } else {
            false
        }
    };
    if belongs && let Some(receiver) = state.transfers.receiver.lock().map_err(error)?.as_ref() {
        receiver
            .receiver
            .cancel_current()
            .map_err(|_| "无法取消接收任务。")?;
        return Ok(true);
    }
    Ok(false)
}
pub fn prepare_exit(app: &tauri::AppHandle) -> Result<()> {
    let state = app.state::<Runtime>();
    if state.transfers.sending.lock().map_err(error)?.is_some()
        || !state.transfers.events.lock().map_err(error)?.1.is_empty()
    {
        return Err("文件互传仍在进行，请先完成或取消。".into());
    }
    stop_receiver(app, None)
}

#[tauri::command]
pub async fn transfer_devices(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Vec<crate::transfer_discovery::Device>> {
    metadata_scope(&window)?;
    let own = app
        .state::<Runtime>()
        .transfers
        .receiver
        .lock()
        .map_err(error)?
        .as_ref()
        .map(|receiver| receiver.fingerprint.clone());
    let mut devices = tauri::async_runtime::spawn_blocking(crate::transfer_discovery::discover)
        .await
        .map_err(error)?
        .map_err(|_| "暂时无法查找附近设备，请检查局域网连接。".to_string())?;
    devices.retain(|device| own.as_ref() != Some(&device.fingerprint));
    Ok(devices)
}
