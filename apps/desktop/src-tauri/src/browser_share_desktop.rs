use crate::browser_share_process::{Connection, Outcome, SenderProgram};
use crate::{Runtime, error, metadata_scope, store::Result};
use tauri::{Emitter, Manager};

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
    Ok(program().is_ok_and(|program| program.path.is_file()))
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
