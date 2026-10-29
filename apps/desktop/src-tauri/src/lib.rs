pub mod desktop;
mod desktop_runtime;
pub mod entry;
mod shelf_windows;
pub mod store;
use ningmao_transfer_client as loopback_transport;
pub mod transfer_runtime;
pub mod transfer_sender;
pub mod transfer_tasks;
mod wake_shortcut;
pub mod window_surface;
pub mod windows_recycle;
use serde::Serialize;
use std::{
    fs::{File, OpenOptions},
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use store::{Result, Snapshot, Store};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

struct PlannedRecycle {
    owner: String,
    created: Instant,
    items: Vec<(i64, windows_recycle::Target)>,
}
#[derive(Serialize)]
struct RecycleImpact {
    id: i64,
    name: String,
    path: String,
    other_references: usize,
    shelf_kind: String,
}
#[derive(Serialize)]
struct RecyclePreview {
    ticket: String,
    items: Vec<RecycleImpact>,
}
#[derive(Serialize)]
struct RecycleOutcome {
    id: i64,
    status: String,
    message: String,
}
struct Runtime {
    store: Mutex<Store>,
    active: Mutex<Option<(i64, Arc<AtomicBool>)>>,
    thumbnail: Mutex<()>,
    data_root: PathBuf,
    recycle_test_root: Option<PathBuf>,
    recycle_plans: Mutex<std::collections::HashMap<String, PlannedRecycle>>,
    recycling: Mutex<Option<(String, Arc<AtomicBool>)>>,
    _process_lock: File,
}
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn main_only(window: &tauri::WebviewWindow) -> Result<()> {
    if desktop::permits(window.label(), desktop::Scope::Files) {
        Ok(())
    } else {
        Err("此操作只允许在主文件架中执行。".into())
    }
}
fn metadata_window(window: &tauri::WebviewWindow) -> Result<()> {
    if desktop::permits(window.label(), desktop::Scope::Metadata)
        || shelf_windows::scope(window).is_ok()
    {
        Ok(())
    } else {
        Err("此操作只允许在文件架或管理中心执行。".into())
    }
}
fn desktop_window(window: &tauri::WebviewWindow) -> Result<()> {
    if desktop::permits(window.label(), desktop::Scope::Desktop)
        || shelf_windows::scope(window).is_ok()
    {
        Ok(())
    } else {
        Err("未知桌面窗口。".into())
    }
}
fn metadata_scope(window: &tauri::WebviewWindow) -> Result<Option<i64>> {
    metadata_window(window)?;
    if window.label() == "manager" {
        Ok(None)
    } else {
        shelf_windows::scope(window)
    }
}
async fn scoped_database<T: Send + 'static>(
    app: tauri::AppHandle,
    scope: Option<i64>,
    ids: Vec<i64>,
    action: impl FnOnce(&mut Store) -> Result<T> + Send + 'static,
) -> Result<T> {
    database(app, move |s| {
        s.validate_item_scope(scope, &ids)?;
        action(s)
    })
    .await
}
async fn database<T: Send + 'static>(
    app: tauri::AppHandle,
    action: impl FnOnce(&mut Store) -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let mut store = state.store.lock().map_err(error)?;
        action(&mut store)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn snapshot(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<Snapshot> {
    let scope = shelf_windows::scope(&window)?;
    let excluded = shelf_windows::ids(&app)?;
    database(app, move |s| s.snapshot_scoped(scope, &excluded)).await
}
#[tauri::command]
async fn choose_files(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<Vec<String>> {
    shelf_windows::scope(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_parent(&window)
            .set_title("添加文件：收集架保存引用，绑定目录复制文件")
            .blocking_pick_files()
            .unwrap_or_default()
            .into_iter()
            .map(|p| {
                p.into_path().map_err(error).and_then(|p| {
                    p.to_str()
                        .map(str::to_owned)
                        .ok_or("不支持此路径编码。".into())
                })
            })
            .collect()
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn choose_folder(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<Option<i64>> {
    main_only(&window)?;
    let pick_app = app.clone();
    let path = tauri::async_runtime::spawn_blocking(move || {
        pick_app
            .dialog()
            .file()
            .set_title("主动绑定真实文件夹：拖入将复制并保留来源")
            .blocking_pick_folder()
    })
    .await
    .map_err(error)?;
    match path {
        Some(path) => {
            let path = path.into_path().map_err(error)?;
            database(app, move |s| s.bind_directory(&path).map(Some)).await
        }
        None => Ok(None),
    }
}
#[derive(Serialize)]
struct ImportResult {
    added: usize,
    job_id: Option<i64>,
    errors: Vec<String>,
}
#[derive(Clone, Serialize)]
struct Progress {
    job_id: i64,
    name: String,
    file_index: usize,
    file_count: usize,
    bytes: u64,
    total: u64,
}
#[tauri::command]
async fn import_paths(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
    paths: Vec<String>,
) -> Result<ImportResult> {
    let scope = shelf_windows::scope(&window)?;
    if scope.unwrap_or(desktop_runtime::active_shelf(&app)?) != shelf_id || shelf_id <= 0 {
        return Err("投放目标已切换，请确认当前文件架后重新拖入；未复制任何文件。".into());
    }
    desktop_runtime::require_idle(&app)?;
    run_import(app, shelf_id, paths).await
}
async fn run_import(
    app: tauri::AppHandle,
    shelf_id: i64,
    paths: Vec<String>,
) -> Result<ImportResult> {
    if paths.is_empty() {
        return Ok(ImportResult {
            added: 0,
            job_id: None,
            errors: vec![],
        });
    }
    if paths.len() > 256 {
        return Err("一次最多添加 256 项，请分批添加。".into());
    }
    let shelf = database(app.clone(), move |s| s.shelf(shelf_id)).await?;
    if shelf.kind != "bound" {
        return database(app, move |s| {
            let mut added = 0;
            let mut errors = vec![];
            for path in paths {
                match s.add_reference(shelf_id, std::path::Path::new(&path)) {
                    Ok(_) => added += 1,
                    Err(e) => errors.push(e),
                }
            }
            Ok(ImportResult {
                added,
                job_id: None,
                errors,
            })
        })
        .await;
    }
    let state = app.state::<Runtime>();
    let mut active = state.active.lock().map_err(error)?;
    desktop_runtime::require_idle(&app)?;
    if active.is_some() {
        return Err("当前正在复制，请等待完成或取消后重试。".into());
    }
    let id = state
        .store
        .lock()
        .map_err(error)?
        .begin_job(shelf_id, &format!("等待复制 {} 项", paths.len()))?;
    let cancel = Arc::new(AtomicBool::new(false));
    *active = Some((id, cancel.clone()));
    drop(active);
    desktop_runtime::notify(&app);
    tauri::async_runtime::spawn_blocking(move || copy_job(app, id, shelf_id, paths, cancel));
    Ok(ImportResult {
        added: 0,
        job_id: Some(id),
        errors: vec![],
    })
}
#[derive(Clone, Serialize)]
struct CopyFinished {
    job_id: i64,
    status: String,
    message: String,
}
fn finish_copy_job(store: &Mutex<Store>, id: i64, status: &str, message: &str) -> CopyFinished {
    match store
        .lock()
        .map_err(error)
        .and_then(|mut store| store.finish_job(id, status, message))
    {
        Ok(()) => CopyFinished {
            job_id: id,
            status: status.into(),
            message: message.into(),
        },
        Err(reason) => CopyFinished {
            job_id: id,
            status: "interrupted".into(),
            message: format!(
                "任务结果未能保存；已生成的副本与来源保留。请重新启动后核对任务和绑定目录。原因：{reason}"
            ),
        },
    }
}
fn copy_job(
    app: tauri::AppHandle,
    id: i64,
    shelf: i64,
    paths: Vec<String>,
    cancel: Arc<AtomicBool>,
) {
    let state = app.state::<Runtime>();
    let mut copied = 0;
    let mut failures = vec![];
    let count = paths.len();
    let result: Result<()> = (|| {
        for (index, path) in paths.iter().enumerate() {
            if cancel.load(Ordering::SeqCst) {
                break;
            }
            let source = PathBuf::from(path);
            let plan = state.store.lock().map_err(error)?.plan_copy(shelf, &source);
            let target = plan.and_then(|plan| {
                let mut last = Instant::now() - Duration::from_secs(1);
                plan.execute(
                    &cancel,
                    |bytes, total| {
                        if last.elapsed() >= Duration::from_millis(100) || bytes == total {
                            let _ = app.emit(
                                "copy-progress",
                                Progress {
                                    job_id: id,
                                    name: source
                                        .file_name()
                                        .unwrap_or_default()
                                        .to_string_lossy()
                                        .into_owned(),
                                    file_index: index + 1,
                                    file_count: count,
                                    bytes,
                                    total,
                                },
                            );
                            last = Instant::now();
                        }
                    },
                    |path| state.store.lock().map_err(error)?.stage_job(id, path),
                )
            });
            match target {
                Ok(target) => {
                    copied += 1;
                    if let Err(e) = state
                        .store
                        .lock()
                        .map_err(error)?
                        .record_copy(shelf, &target)
                    {
                        failures.push(format!("文件已复制，记录写入失败；刷新目录可重新发现：{e}"));
                    }
                }
                Err(e) => failures.push(format!(
                    "{}：{e}",
                    source.file_name().unwrap_or_default().to_string_lossy()
                )),
            }
        }
        Ok(())
    })();
    if let Err(e) = result {
        failures.push(e);
    }
    let cancelled = cancel.load(Ordering::SeqCst);
    let status = if cancelled {
        "cancelled"
    } else if failures.is_empty() {
        "completed"
    } else if copied > 0 {
        "partial"
    } else {
        "failed"
    };
    let message = format!(
        "{}；已完成 {copied}/{count} 项，来源保留。{}",
        if cancelled {
            "已取消"
        } else if failures.is_empty() {
            "复制完成"
        } else {
            "复制有错误"
        },
        failures.join("；")
    );
    let finished = finish_copy_job(&state.store, id, status, &message);
    if let Ok(mut active) = state.active.lock() {
        *active = None;
    }
    desktop_runtime::notify(&app);
    if finished.status == "interrupted" {
        let _ = app.emit("desktop-error", finished.message.clone());
    }
    let _ = app.emit("copy-finished", finished);
}
#[tauri::command]
fn cancel_copy(app: tauri::AppHandle, window: tauri::WebviewWindow, job_id: i64) -> Result<()> {
    let scope = metadata_scope(&window)?;
    let state = app.state::<Runtime>();
    state
        .store
        .lock()
        .map_err(error)?
        .validate_job_scope(scope, job_id)?;
    let active = state.active.lock().map_err(error)?;
    if let Some((id, cancel)) = active.as_ref()
        && *id == job_id
    {
        cancel.store(true, Ordering::SeqCst);
        return Ok(());
    }
    Err("该任务已结束，请刷新查看结果。".into())
}
#[tauri::command]
async fn remove_reference(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: i64,
) -> Result<()> {
    let scope = shelf_windows::scope(&window)?;
    let _guard = LifecycleGuard::acquire(&app)?;
    scoped_database(app.clone(), scope, vec![id], move |s| {
        s.remove_reference(id)
    })
    .await?;
    app.emit("workstation-changed", ()).map_err(error)
}
struct RecycleRunGuard(tauri::AppHandle);
impl Drop for RecycleRunGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = self.0.state::<Runtime>().recycling.lock() {
            *active = None;
        }
    }
}
struct LifecycleGuard(tauri::AppHandle);
impl LifecycleGuard {
    fn acquire(app: &tauri::AppHandle) -> Result<Self> {
        lifecycle_idle(app)?;
        app.state::<desktop_runtime::Desktop>()
            .transitioning
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "正在调整记录，请稍后重试。")?;
        let guard = Self(app.clone());
        if app
            .state::<Runtime>()
            .active
            .lock()
            .map_err(error)?
            .is_some()
            || app
                .webview_windows()
                .keys()
                .any(|label| window_surface::moving(label))
        {
            return Err("文件任务或窗口移动已开始，请稍后重试。".into());
        }
        let desktop = app.state::<desktop_runtime::Desktop>();
        if desktop.drags.lock().map_err(error)?.busy()
            || desktop.entry.lock().map_err(error)?.busy()
        {
            return Err("原生投放已开始，请先完成或取消。".into());
        }
        Ok(guard)
    }
}
impl Drop for LifecycleGuard {
    fn drop(&mut self) {
        self.0
            .state::<desktop_runtime::Desktop>()
            .transitioning
            .store(false, Ordering::SeqCst);
    }
}
#[tauri::command]
async fn plan_system_recycle(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    ids: Vec<i64>,
) -> Result<RecyclePreview> {
    let scope = shelf_windows::scope(&window)?;
    lifecycle_idle(&app)?;
    if ids.is_empty()
        || ids.len() > 64
        || ids.iter().collect::<std::collections::HashSet<_>>().len() != ids.len()
    {
        return Err("请选择 1 至 64 个不同文件。".into());
    }
    if app.state::<Runtime>().recycle_test_root.is_none() {
        return Err(
            "此候选的实体回收仅在专用合成测试入口启用；私人素材不启用。请使用候选包的测试启动器。"
                .into(),
        );
    }
    let owner = window.label().to_string();
    let worker = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = worker.state::<Runtime>();
        let store = runtime.store.lock().map_err(error)?;
        store.validate_item_scope(scope, &ids)?;
        let metadata = store.management_snapshot()?;
        let mut targets = Vec::new();
        let mut impacts = Vec::new();
        for id in ids {
            let row = metadata
                .items
                .iter()
                .find(|r| r.id == id)
                .ok_or("引用不存在")?;
            let target = windows_recycle::inspect(&store.item_path(id)?, &runtime.data_root)?;
            let allowed = runtime
                .recycle_test_root
                .as_ref()
                .ok_or("实体回收测试目录未授权")?;
            if !target.path.starts_with(allowed) {
                return Err(
                    "当前候选仅允许回收专用合成测试目录中的文件；私人素材未被操作。".into(),
                );
            }
            if targets
                .iter()
                .any(|(_, t): &(i64, windows_recycle::Target)| t.path == target.path)
            {
                return Err("多条选中引用指向同一路径，请仅选择一条发起系统回收。".into());
            }
            let other = metadata
                .items
                .iter()
                .filter(|r| r.id != id && std::path::Path::new(&r.path) == target.path)
                .count();
            impacts.push(RecycleImpact {
                id,
                name: row.name.clone(),
                path: target.path.to_string_lossy().into_owned(),
                other_references: other,
                shelf_kind: metadata
                    .shelves
                    .iter()
                    .find(|s| s.id == row.shelf_id)
                    .ok_or("文件架不存在")?
                    .kind
                    .clone(),
            });
            targets.push((id, target));
        }
        drop(store);
        let ticket = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(error)?
            .as_nanos()
            .to_string();
        let mut plans = runtime.recycle_plans.lock().map_err(error)?;
        plans.retain(|_, p| p.created.elapsed() < Duration::from_secs(300));
        if plans.len() >= 32 {
            return Err("待确认操作过多，请稍后重试。".into());
        }
        plans.insert(
            ticket.clone(),
            PlannedRecycle {
                owner,
                created: Instant::now(),
                items: targets,
            },
        );
        Ok(RecyclePreview {
            ticket,
            items: impacts,
        })
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn cancel_system_recycle(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<()> {
    shelf_windows::scope(&window)?;
    if let Some((owner, cancel)) = &*app.state::<Runtime>().recycling.lock().map_err(error)? {
        if owner != window.label() {
            return Err("请在发起回收的窗口取消。".into());
        }
        cancel.store(true, Ordering::SeqCst);
    }
    Ok(())
}
#[tauri::command]
async fn execute_system_recycle(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    ticket: String,
) -> Result<Vec<RecycleOutcome>> {
    let scope = shelf_windows::scope(&window)?;
    let plan = app
        .state::<Runtime>()
        .recycle_plans
        .lock()
        .map_err(error)?
        .remove(&ticket)
        .ok_or("确认已过期，请重新预览影响。")?;
    if plan.owner != window.label() || plan.created.elapsed() > Duration::from_secs(300) {
        return Err("确认已过期或不属于当前窗口。".into());
    }
    lifecycle_idle(&app)?;
    let dialog = app.clone();
    let count = plan.items.len();
    let confirm=tauri::async_runtime::spawn_blocking(move||dialog.dialog().message(format!("确认把这 {count} 个真实文件移入 Windows 回收站？这会影响原始路径，其他架的同路径引用将失效。仅软件记录可在本软件恢复；实体文件须从 Windows 回收站恢复。不会永久删除兜底。" )).title("再次确认：回收真实文件").buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel).parent(&window).blocking_show()).await.map_err(error)?;
    if !confirm {
        return Ok(plan
            .items
            .iter()
            .map(|(id, _)| RecycleOutcome {
                id: *id,
                status: "cancelled".into(),
                message: "用户取消，文件及引用保留。".into(),
            })
            .collect());
    }
    let guard = LifecycleGuard::acquire(&app)?;
    let owner = plan.owner.clone();
    let cancel = Arc::new(AtomicBool::new(false));
    *app.state::<Runtime>().recycling.lock().map_err(error)? = Some((owner, cancel.clone()));

    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let _recycle_guard = RecycleRunGuard(app.clone());
        let runtime = app.state::<Runtime>();
        let mut outcomes = Vec::new();
        for (id, target) in plan.items {
            if cancel.load(Ordering::SeqCst) {
                outcomes.push(RecycleOutcome {
                    id,
                    status: "cancelled".into(),
                    message: "已取消后续文件，保留原文件。".into(),
                });
                continue;
            }
            let prepare = (|| {
                let store = runtime.store.lock().map_err(error)?;
                store.validate_item_scope(scope, &[id])?;
                store.begin_recycle(id, &target.path)
            })();
            let journal = match prepare {
                Ok(j) => j,
                Err(e) => {
                    outcomes.push(RecycleOutcome {
                        id,
                        status: "failed".into(),
                        message: e,
                    });
                    continue;
                }
            };
            let result =
                windows_recycle::execute_with_cancel(&target, &runtime.data_root, cancel.clone());
            let (status, message) = match result {
                Ok(_) => (
                    "os-success",
                    "Windows 已确认回收；发起引用移入软件回收站。".to_string(),
                ),
                Err(e) => (
                    "uncertain",
                    format!("未确认系统回收完成：{e}。原引用保留，请核对 Windows 回收站后再操作。"),
                ),
            };
            let commit = runtime
                .store
                .lock()
                .map_err(error)?
                .recycle_result(journal, status, &message);
            outcomes.push(RecycleOutcome {
                id,
                status: if commit.is_err() {
                    "uncertain"
                } else if status == "os-success" {
                    "success"
                } else {
                    "uncertain"
                }
                .into(),
                message: commit
                    .err()
                    .map(|e| {
                        format!("{message} 记录提交失败：{e}；请核对系统回收站，不要重复回收。")
                    })
                    .unwrap_or(message),
            });
        }
        *runtime.recycling.lock().map_err(error)? = None;
        app.emit("workstation-changed", ()).map_err(error)?;
        Ok(outcomes)
    })
    .await
    .map_err(error)?
}
fn lifecycle_idle(app: &tauri::AppHandle) -> Result<()> {
    desktop_runtime::require_idle(app)?;
    if app
        .state::<Runtime>()
        .active
        .lock()
        .map_err(error)?
        .is_some()
    {
        return Err("复制正在进行，请完成或取消后再调整记录。".into());
    }
    if app
        .webview_windows()
        .keys()
        .any(|label| window_surface::moving(label))
    {
        return Err("请先完成窗口移动。".into());
    }
    Ok(())
}
#[tauri::command]
async fn recycle_activity(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Vec<store::RecycleActivity>> {
    metadata_window(&window)?;
    database(app, |s| s.recycle_activity()).await
}
#[tauri::command]
async fn remove_references(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    ids: Vec<i64>,
) -> Result<()> {
    let scope = shelf_windows::scope(&window)?;
    let _guard = LifecycleGuard::acquire(&app)?;
    scoped_database(app.clone(), scope, ids.clone(), move |s| {
        s.remove_references(&ids)
    })
    .await?;
    app.emit("workstation-changed", ()).map_err(error)
}
#[tauri::command]
async fn trash_entries(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    filter: Option<i64>,
) -> Result<Vec<store::TrashEntry>> {
    metadata_window(&window)?;
    database(app, move |s| s.trash_entries(filter)).await
}
fn reconcile_recycle(app: &tauri::AppHandle) -> Result<()> {
    let catalog = app
        .state::<Runtime>()
        .store
        .lock()
        .map_err(error)?
        .shelf_catalog()?;
    let ids = catalog.iter().map(|s| s.id).collect::<Vec<_>>();
    let state = app.state::<desktop_runtime::Desktop>();
    let old = state.layout.lock().map_err(error)?.detached.clone();
    state.layout.lock().map_err(error)?.reconcile(&ids);
    state.entry.lock().map_err(error)?.reset();
    for record in old {
        if !ids.contains(&record.shelf_id)
            && let Some(w) = app.get_webview_window(&format!("shelf-{}", record.shelf_id))
        {
            w.hide().map_err(error)?;
        }
    }
    desktop_runtime::entry_geometry(app)?;
    if ids.is_empty()
        && let Some(main) = app.get_webview_window("main")
    {
        main.show().map_err(error)?;
    }
    state.save()?;
    app.emit("workstation-changed", ()).map_err(error)
}
#[tauri::command]
async fn trash_shelf(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
) -> Result<()> {
    let scope = shelf_windows::scope(&window)?;
    if scope.is_some_and(|id| id != shelf_id) {
        return Err("独立窗口只能回收自己的文件架。".into());
    }
    let _guard = LifecycleGuard::acquire(&app)?;
    if let Some(w) = app.get_webview_window(&shelf_windows::label_for(&app, shelf_id)?) {
        shelf_windows::capture(&w.as_ref().window());
    }
    let layout = serde_json::to_string(
        &*app
            .state::<desktop_runtime::Desktop>()
            .layout
            .lock()
            .map_err(error)?,
    )
    .map_err(error)?;
    database(app.clone(), move |s| {
        s.save_recycled_layout(shelf_id, &layout)?;
        s.trash_shelf(shelf_id)
    })
    .await?;
    reconcile_recycle(&app)
}
#[tauri::command]
async fn restore_trash(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    entity: String,
    id: i64,
) -> Result<()> {
    metadata_window(&window)?;
    let _guard = LifecycleGuard::acquire(&app)?;
    let is_shelf = entity == "shelf";
    let saved = database(app.clone(), move |s| {
        let saved = if is_shelf {
            s.recycled_layout(id)?
        } else {
            None
        };
        if let Some(raw) = &saved {
            let layout: desktop::Layout = serde_json::from_str(raw).map_err(error)?;
            if !layout.validate() {
                return Err("已保存窗口布局不兼容；回收记录保持不变。".into());
            }
        }
        s.restore_trash(&entity, id)?;
        Ok(saved)
    })
    .await?;
    if let Some(raw) = saved {
        let old: desktop::Layout = serde_json::from_str(&raw).map_err(error)?;
        let state = app.state::<desktop_runtime::Desktop>();
        let mut current = state.layout.lock().map_err(error)?;
        if let Some(record) = old.detached.into_iter().find(|r| r.shelf_id == id)
            && !current.detached.iter().any(|r| r.shelf_id == id)
        {
            current.detached.push(record);
        }
        if old.collapsed.contains(&id) && !current.collapsed.contains(&id) {
            current.collapsed.push(id);
            current.enabled = true;
        }
        if current.active_shelf == 0 && !current.detached.iter().any(|r| r.shelf_id == id) {
            current.active_shelf = id;
        }
    }
    reconcile_recycle(&app)?;
    if is_shelf {
        let state = app.state::<desktop_runtime::Desktop>();
        let record = state
            .layout
            .lock()
            .map_err(error)?
            .detached
            .iter()
            .find(|r| r.shelf_id == id)
            .cloned();
        if let Some(record) = record
            && record.visible
        {
            shelf_windows::ensure(&app, id)?.show().map_err(error)?;
        }
    }
    Ok(())
}
#[tauri::command]
async fn purge_trash(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    entity: String,
    id: i64,
) -> Result<bool> {
    metadata_window(&window)?;
    lifecycle_idle(&app)?;
    let pick = app.clone();
    let confirmed=tauri::async_runtime::spawn_blocking(move||pick.dialog().message("永久清理所选软件记录？原文件和 Windows 回收站均不受影响；此记录将无法从软件回收站恢复。").title("永久清理软件记录").buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel).parent(&window).blocking_show()).await.map_err(error)?;
    if !confirmed {
        return Ok(false);
    }
    let _guard = LifecycleGuard::acquire(&app)?;
    database(app.clone(), move |s| s.purge_trash(&entity, id)).await?;
    reconcile_recycle(&app)?;
    Ok(true)
}
#[tauri::command]
async fn relocate_reference(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: i64,
    directory: bool,
) -> Result<bool> {
    let scope = shelf_windows::scope(&window)?;
    let original = scoped_database(app.clone(), scope, vec![id], move |s| {
        s.relocation_source(id)
    })
    .await?;
    let pick_app = app.clone();
    let chosen = tauri::async_runtime::spawn_blocking(move || -> Result<_> {
        let picker = pick_app.dialog().file().set_parent(&window).set_title("重新定位失效引用：选择目标后仍需确认");
        let selected = if directory { picker.blocking_pick_folder() } else { picker.blocking_pick_file() };
        let Some(selected) = selected else { return Ok(None); };
        let selected = store::canonical_user_path(&selected.into_path().map_err(error)?)?;
        if selected.is_dir() != directory { return Err("目标类型与选择的文件/文件夹入口不一致。".into()); }
        let confirmed = pick_app.dialog().message(format!(
            "原引用：{}\n\n重新定位到：{}\n\n只替换软件内引用，保留标签与手动顺序。不移动、复制或删除实体文件。",
            original.display(), selected.display()))
            .title("确认重新定位引用").parent(&window)
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom("确认替换引用".into(), "取消".into()))
            .blocking_show();
        Ok(confirmed.then_some((original, selected)))
    }).await.map_err(error)??;
    let Some((original, chosen)) = chosen else {
        return Ok(false);
    };
    scoped_database(app, scope, vec![id], move |s| {
        s.relink_reference(id, &original, &chosen)
    })
    .await?;
    Ok(true)
}
#[tauri::command]
async fn set_tags(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: i64,
    tags: Vec<String>,
) -> Result<()> {
    let scope = shelf_windows::scope(&window)?;
    scoped_database(app.clone(), scope, vec![id], move |s| s.set_tags(id, tags)).await?;
    let _ = app.emit("reference-tags-changed", ());
    Ok(())
}
#[tauri::command]
async fn reorder(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
    ids: Vec<i64>,
) -> Result<()> {
    let scope = shelf_windows::scope(&window)?;
    if scope.is_some_and(|id| id != shelf_id) {
        return Err("排序目标不属于当前独立架。".into());
    }
    database(app, move |s| s.reorder(shelf_id, &ids)).await
}
#[tauri::command]
async fn thumbnail(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: i64,
) -> Result<Option<String>> {
    let scope = shelf_windows::scope(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let path = {
            let store = state.store.lock().map_err(error)?;
            store.validate_item_scope(scope, &[id])?;
            store.item_path(id)?
        };
        // ponytail: one bounded decoder at a time; use a measured worker pool if throughput needs it.
        let _slot = state.thumbnail.lock().map_err(error)?;
        store::thumbnail(&path)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn open_item(app: tauri::AppHandle, window: tauri::WebviewWindow, id: i64) -> Result<bool> {
    let scope = shelf_windows::scope(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let target = {let store=state.store.lock().map_err(error)?;store.validate_item_scope(scope,&[id])?;store.opening_target(id)?};
        if target.is_file() && store::needs_open_confirmation(&target) && !app.dialog()
            .message(format!("此文件可能运行程序、脚本或快捷方式：\n{}\n\n仅在信任文件来源时继续。是否交给系统打开？", target.display()))
            .title("确认打开可执行内容").parent(&window)
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom("继续打开".into(), "取消".into()))
            .blocking_show() {
            return Ok(false);
        }
        // The picker/confirmation never holds the database lock. Recheck after user interaction.
        state.store.lock().map_err(error)?.validate_opening_target(id, &target)?;
        // Windows ShellExecuteExW receives the path as data, with no command shell or custom app.
        open::that_detached(&target).map_err(|e| format!("无法请求系统打开，请检查文件关联或访问权限：{e}"))?;
        Ok(true)
    }).await.map_err(error)?
}
#[tauri::command]
async fn reveal_item(app: tauri::AppHandle, window: tauri::WebviewWindow, id: i64) -> Result<()> {
    let scope = shelf_windows::scope(&window)?;
    let path = scoped_database(app, scope, vec![id], move |s| s.item_path(id)).await?;
    #[cfg(windows)]
    std::process::Command::new("explorer.exe")
        .arg(format!("/select,{}", path.display()))
        .spawn()
        .map_err(error)?;
    Ok(())
}
#[tauri::command]
fn start_native_drag(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    ids: Vec<i64>,
) -> Result<()> {
    let scope = shelf_windows::scope(&window)?;
    if ids.is_empty() || ids.len() > 64 {
        return Err("请选择 1 至 64 项拖出。".into());
    }
    let paths: Vec<PathBuf> = {
        let state = app.state::<Runtime>();
        let store = state.store.lock().map_err(error)?;
        store.validate_item_scope(scope, &ids)?;
        ids.into_iter()
            .map(|id| {
                store
                    .item_path(id)
                    .and_then(|p| store::canonical_user_path(&p))
            })
            .collect::<Result<_>>()?
    };
    let native_window = window.clone();
    {
        let desktop = app.state::<desktop_runtime::Desktop>();
        let mut drags = desktop.drags.lock().map_err(error)?;
        if desktop.transitioning.load(Ordering::SeqCst) {
            return Err("正在调整记录，请稍后拖出。".into());
        }
        if !drags.outgoing.is_empty() {
            return Err("已有原生拖出正在进行，请先完成或取消。".into());
        }
        drags.outgoing.insert(window.label().into());
    }
    let scheduled = window
        .run_on_main_thread(move || {
            let notify = native_window.clone();
            let result = drag::start_drag(
                &native_window,
                drag::DragItem::Files(paths),
                drag::Image::Raw(include_bytes!("../icons/32x32.png").to_vec()),
                move |result, _| {
                    if let Ok(mut drags) = notify
                        .app_handle()
                        .state::<desktop_runtime::Desktop>()
                        .drags
                        .lock()
                    {
                        drags.outgoing.remove(notify.label());
                    }
                    let _ = notify.emit("native-drag-result", format!("{result:?}"));
                },
                drag::Options {
                    mode: drag::DragMode::Copy,
                    skip_animatation_on_cancel_or_failure: true,
                },
            );
            if let Err(e) = result {
                if let Ok(mut drags) = native_window
                    .app_handle()
                    .state::<desktop_runtime::Desktop>()
                    .drags
                    .lock()
                {
                    drags.outgoing.remove(native_window.label());
                }
                let _ = native_window.emit("native-drag-result", format!("拖出失败：{e}"));
            }
        })
        .map_err(error);
    if scheduled.is_err() {
        app.state::<desktop_runtime::Desktop>()
            .drags
            .lock()
            .map_err(error)?
            .outgoing
            .remove(window.label());
    }
    scheduled
}
#[tauri::command]
fn toggle_topmost(window: tauri::WebviewWindow) -> Result<bool> {
    shelf_windows::scope(&window)?;
    let value = !window.is_always_on_top().map_err(error)?;
    window.set_always_on_top(value).map_err(error)?;
    shelf_windows::capture_all(window.app_handle());
    let _ = window
        .app_handle()
        .state::<desktop_runtime::Desktop>()
        .save();
    Ok(value)
}
#[tauri::command]
fn quit(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<()> {
    shelf_windows::scope(&window)?;
    clean_quit(app)
}
fn clean_quit(app: tauri::AppHandle) -> Result<()> {
    lifecycle_idle(&app)?;
    desktop_runtime::require_idle(&app)?;
    let state = app.state::<Runtime>();
    if state.active.lock().map_err(error)?.is_some() {
        return Err("复制尚未结束，请先等待完成或取消。".into());
    }
    state.store.lock().map_err(error)?.clean_exit()?;
    shelf_windows::capture_all(&app);
    let _ = app.state::<desktop_runtime::Desktop>().save();
    app.exit(0);
    Ok(())
}
#[tauri::command]
async fn create_shelf(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    name: String,
    session: bool,
) -> Result<i64> {
    main_only(&window)?;
    let id = database(app.clone(), move |s| s.create_shelf(&name, session)).await?;
    let _ = app.emit("workstation-changed", ());
    Ok(id)
}
#[tauri::command]
async fn copy_references(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    target: i64,
    ids: Vec<i64>,
) -> Result<usize> {
    let scope = shelf_windows::scope(&window)?;
    let checked = ids.clone();
    let added = scoped_database(app.clone(), scope, checked, move |s| {
        s.copy_references(target, &ids)
    })
    .await?;
    let _ = app.emit("workstation-changed", ());
    Ok(added)
}
#[tauri::command]
fn file_window_state(window: tauri::WebviewWindow) -> Result<bool> {
    shelf_windows::scope(&window)?;
    window.is_maximized().map_err(error)
}
#[tauri::command]
fn file_window_action(window: tauri::WebviewWindow, action: String) -> Result<bool> {
    shelf_windows::scope(&window)?;
    desktop_runtime::require_idle(window.app_handle())?;
    match action.as_str() {
        "minimize" => window.minimize().map_err(error)?,
        "toggle-maximize" => {
            if window.is_maximized().map_err(error)? {
                window.unmaximize().map_err(error)?;
            } else {
                shelf_windows::capture(&window.as_ref().window());
                window.maximize().map_err(error)?;
            }
        }
        "hide" => window.close().map_err(error)?,
        _ => return Err("未知窗口操作。".into()),
    }
    window.is_maximized().map_err(error)
}
#[tauri::command]
fn desktop_state(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<desktop_runtime::View> {
    desktop_window(&window)?;
    desktop_runtime::view(&app)
}
#[tauri::command]
fn desktop_collapse(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
) -> Result<()> {
    let scope = shelf_windows::scope(&window)?;
    if scope.is_some_and(|id| id != shelf_id) {
        return Err("不能收起其他独立架。".into());
    }
    desktop_runtime::collapse(&app, shelf_id)
}
#[tauri::command]
fn desktop_present(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
    kind: entry::Kind,
) -> Result<()> {
    if !desktop::permits(window.label(), desktop::Scope::Entry) {
        return Err("只允许从悬浮入口调整预览形态。".into());
    }
    desktop_runtime::present(&app, shelf_id, kind)
}
#[tauri::command]
async fn desktop_peek(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
) -> Result<store::EntryPreview> {
    if !desktop::permits(window.label(), desktop::Scope::Entry) {
        return Err("只允许读取当前悬浮轻预览。".into());
    }
    {
        let state = app.state::<desktop_runtime::Desktop>();
        let entry = state.entry.lock().map_err(error)?;
        if entry.presentation.kind != entry::Kind::QuickPeek
            || entry.presentation.shelf_id != Some(shelf_id)
        {
            return Err("轻预览目标已变化，请重新打开。".into());
        }
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let (mut data, paths) = {
            let store = state.store.lock().map_err(error)?;
            let data = store.entry_preview(shelf_id)?;
            store.validate_item_scope(
                Some(shelf_id),
                &data.items.iter().map(|i| i.id).collect::<Vec<_>>(),
            )?;
            let paths = data
                .items
                .iter()
                .map(|item| store.opening_target(item.id))
                .collect::<Vec<_>>();
            (data, paths)
        };
        let _decoder = state.thumbnail.lock().map_err(error)?;
        for (item, path) in data.items.iter_mut().zip(paths) {
            match path.and_then(|path| std::fs::metadata(&path).map_err(error).map(|m| (path, m))) {
                Ok((path, metadata)) => {
                    item.status = "normal".into();
                    item.kind = if metadata.is_dir() {
                        "folder".into()
                    } else {
                        path.extension()
                            .and_then(|s| s.to_str())
                            .unwrap_or("file")
                            .to_lowercase()
                    };
                    item.thumbnail = store::thumbnail(&path).unwrap_or(None);
                }
                Err(_) => item.status = "missing".into(),
            }
        }
        Ok(data)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn desktop_open(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
) -> Result<()> {
    desktop_window(&window)?;
    desktop_runtime::open(&app, shelf_id, true)
}
#[tauri::command]
fn desktop_select(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
) -> Result<()> {
    main_only(&window)?;
    desktop_runtime::select(&app, shelf_id)
}
#[tauri::command]
fn desktop_page(app: tauri::AppHandle, window: tauri::WebviewWindow, delta: i32) -> Result<()> {
    if window.label() != "desktop-entry" {
        return Err("只允许从Dock翻页。".into());
    }
    desktop_runtime::page(&app, delta)
}
#[tauri::command]
async fn desktop_move(window: tauri::WebviewWindow) -> Result<()> {
    window_surface::drag(window).await
}
#[tauri::command]
fn desktop_contour(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    amount: f64,
    lower: bool,
) -> Result<()> {
    if window.label() != "desktop-entry" || !amount.is_finite() || !(0.0..=1.0).contains(&amount) {
        return Err("入口轮廓参数不合法。".into());
    }
    desktop_runtime::require_idle(&app)?;
    if window_surface::moving(window.label()) {
        return Err("移动中保持原轮廓。".into());
    }
    let state = app.state::<desktop_runtime::Desktop>();
    let l = state.layout.lock().map_err(error)?.clone();
    let mut e = state.entry.lock().map_err(error)?;
    if e.presentation.kind != entry::Kind::Capsule || e.close_lower != lower {
        return Err("入口形态已变化。".into());
    }
    e.close_growth = amount;
    let entry = e.clone();
    drop(e);
    window_surface::apply(&window, &entry, &l)
}
#[tauri::command]
fn desktop_sense(app: tauri::AppHandle, window: tauri::WebviewWindow, enabled: bool) -> Result<()> {
    if window.label() != "desktop-entry" {
        return Err("只允许当前入口请求近距感应。".into());
    }
    window_surface::sense(&app, enabled);
    Ok(())
}
#[tauri::command]
fn desktop_disable(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<()> {
    main_only(&window)?;
    desktop_runtime::disable(&app)
}
#[tauri::command]
async fn manager_open(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<()> {
    desktop_window(&window)?;
    desktop_runtime::manager_open(&app)
}
#[tauri::command]
async fn management_snapshot(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<store::ManagementSnapshot> {
    let scope = metadata_scope(&window)?;
    database(app, move |s| {
        let mut data = s.management_snapshot()?;
        if let Some(id) = scope {
            data.shelves.retain(|s| s.id == id);
            data.items.retain(|i| i.shelf_id == id);
            data.jobs.retain(|j| j.shelf_id == id);
        }
        Ok(data)
    })
    .await
}
#[tauri::command]
async fn tag_references(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    ids: Vec<i64>,
    tag: String,
    remove: bool,
) -> Result<usize> {
    let scope = metadata_scope(&window)?;
    let checked = ids.clone();
    let changed = scoped_database(app.clone(), scope, checked, move |s| {
        s.tag_references(&ids, &tag, remove)
    })
    .await?;
    let _ = app.emit("reference-tags-changed", ());
    Ok(changed)
}
#[tauri::command]
fn desktop_configure(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    preferences: desktop::Preferences,
) -> Result<bool> {
    if !desktop::permits(window.label(), desktop::Scope::Metadata) {
        return Err("桌面全局设置请在管理中心调整。".into());
    }
    desktop_runtime::configure(&app, preferences)
}
#[tauri::command]
async fn desktop_detach(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
) -> Result<()> {
    main_only(&window)?;
    shelf_windows::detach(&app, shelf_id)
}
#[tauri::command]
async fn desktop_merge(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    shelf_id: i64,
) -> Result<()> {
    let scope = shelf_windows::scope(&window)?;
    if scope.is_some_and(|id| id != shelf_id) {
        return Err("不能合并其他独立架。".into());
    }
    shelf_windows::merge(&app, shelf_id)
}
#[tauri::command]
fn desktop_hover(app: tauri::AppHandle, window: tauri::WebviewWindow, inside: bool) -> Result<()> {
    if !desktop::permits(window.label(), desktop::Scope::Entry) {
        return Err("未知悬浮入口。".into());
    }
    desktop_runtime::hover(&app, inside)
}
#[tauri::command]
async fn wake_shortcut_state(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<wake_shortcut::View> {
    if window.label() != "manager" {
        return Err("请在管理中心查看快捷键设置。".into());
    }
    wake_shortcut::state(&app)
}
#[tauri::command]
async fn wake_shortcut_configure(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    config: wake_shortcut::Config,
) -> Result<wake_shortcut::View> {
    if window.label() != "manager" {
        return Err("请在管理中心配置快捷键。".into());
    }
    tauri::async_runtime::spawn_blocking(move || wake_shortcut::configure(&app, config, None))
        .await
        .map_err(error)?
}
#[tauri::command]
async fn wake_shortcut_pause(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    paused: bool,
) -> Result<wake_shortcut::View> {
    if window.label() != "manager" {
        return Err("请在管理中心暂停或恢复快捷键。".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        wake_shortcut::configure(&app, wake_shortcut::Config::default(), Some(paused))
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn recover_desktop_windows(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<usize> {
    if window.label() != "manager" {
        return Err("请在管理中心找回窗口。".into());
    }
    shelf_windows::recover_visible(&app)
}
pub fn run() {
    let mut window_state = tauri_plugin_window_state::Builder::default()
        .with_state_flags(tauri_plugin_window_state::StateFlags::SIZE);
    if let Some(root) = std::env::var_os("NINGMAO_DATA_DIR") {
        let file = std::path::absolute(root)
            .expect("无法解析隔离数据目录")
            .join(".window-state.json");
        window_state = window_state.with_filename(file.to_string_lossy());
    }
    tauri::Builder::default()
        .plugin(window_state.build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = std::env::var_os("NINGMAO_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?);
            std::fs::create_dir_all(&root)?;
            let lock = OpenOptions::new()
                .create(true)
                .truncate(false)
                .read(true)
                .write(true)
                .open(root.join("instance.lock"))?;
            lock.try_lock().map_err(|e| {
                std::io::Error::other(format!("相同数据目录已有实例或无法锁定：{e}"))
            })?;
            app.manage(Runtime {
                store: Mutex::new(
                    Store::open(&root.join("workstation.sqlite3"))
                        .map_err(std::io::Error::other)?,
                ),
                active: Mutex::new(None),
                thumbnail: Mutex::new(()),
                data_root: root.clone(),
                recycle_test_root: std::env::var_os("NINGMAO_RECYCLE_TEST_ROOT")
                    .and_then(|p| std::fs::canonicalize(p).ok()),
                recycle_plans: Mutex::new(Default::default()),
                recycling: Mutex::new(None),
                _process_lock: lock,
            });
            desktop_runtime::setup(app.handle(), &root).map_err(std::io::Error::other)?;
            wake_shortcut::setup(app.handle(), &root);
            let show = tauri::menu::MenuItem::with_id(
                app,
                "show",
                "打开柠猫文件工作站",
                true,
                None::<&str>,
            )?;
            let exit = tauri::menu::MenuItem::with_id(
                app,
                "quit",
                "完整退出（复制中请先等待或取消）",
                true,
                None::<&str>,
            )?;
            let menu = tauri::menu::Menu::with_items(app, &[&show, &exit])?;
            tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().ok_or("缺少窗口图标")?.clone())
                .tooltip("柠猫文件工作站")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "show" {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = shelf_windows::show_main(&app);
                        });
                    } else if event.id.as_ref() == "quit"
                        && let Err(message) = clean_quit(app.clone())
                    {
                        app.dialog().message(message).title("尚未退出").show(|_| {});
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            desktop_runtime::window_event(window, event);
            if matches!(event, tauri::WindowEvent::Moved(_)) {
                window_surface::observe_move(window);
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "manager" {
                    api.prevent_close();
                }
                if window.label() == "main" || desktop::detached_id(window.label()).is_some() {
                    if let Err(message) = desktop_runtime::require_idle(window.app_handle()) {
                        let _ = window.emit("desktop-error", message);
                        return;
                    }
                    // Frozen decision 19: X hides to tray. Only explicit collapse creates an orb.
                    shelf_windows::hidden(window);
                    let _ = window.hide();
                    if let Some(state) = window.app_handle().try_state::<desktop_runtime::Desktop>()
                    {
                        let _ = state.save();
                    }
                }
            } else if let tauri::WindowEvent::Moved(position) = event
                && window.label() == "desktop-entry"
                && let Some(state) = window.app_handle().try_state::<desktop_runtime::Desktop>()
                && state
                    .entry
                    .lock()
                    .map(|e| e.presentation.kind == entry::Kind::Orb && !e.busy())
                    .unwrap_or(false)
                && let Ok(mut layout) = state.layout.lock()
                && layout.preferences.edge == desktop::Edge::Free
            {
                layout.entry_position = Some((position.x, position.y));
            }
            if let tauri::WindowEvent::Resized(_) = event
                && (window.label() == "main" || desktop::detached_id(window.label()).is_some())
            {
                let _ = window.emit("file-window-state", window.is_maximized().unwrap_or(false));
            }
            if matches!(
                event,
                tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)
            ) {
                shelf_windows::capture(window);
            }
            if matches!(event, tauri::WindowEvent::Destroyed)
                && let Some(state) = window.app_handle().try_state::<desktop_runtime::Desktop>()
                && let Ok(mut drags) = state.drags.lock()
            {
                drags.incoming.remove(window.label());
                drags.outgoing.remove(window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            recover_desktop_windows,
            wake_shortcut_state,
            wake_shortcut_configure,
            wake_shortcut_pause,
            snapshot,
            choose_files,
            choose_folder,
            import_paths,
            cancel_copy,
            remove_reference,
            plan_system_recycle,
            execute_system_recycle,
            cancel_system_recycle,
            recycle_activity,
            remove_references,
            trash_entries,
            trash_shelf,
            restore_trash,
            purge_trash,
            relocate_reference,
            set_tags,
            reorder,
            thumbnail,
            open_item,
            reveal_item,
            start_native_drag,
            toggle_topmost,
            quit,
            create_shelf,
            copy_references,
            file_window_action,
            file_window_state,
            desktop_state,
            desktop_present,
            desktop_peek,
            desktop_collapse,
            desktop_open,
            desktop_select,
            desktop_page,
            desktop_move,
            desktop_contour,
            desktop_sense,
            desktop_disable,
            manager_open,
            management_snapshot,
            tag_references,
            desktop_configure,
            desktop_hover,
            desktop_detach,
            desktop_merge
        ])
        .run(tauri::generate_context!())
        .expect("柠猫文件工作站启动失败；数据未自动清理");
}

#[cfg(test)]
mod copy_completion_tests {
    use super::*;
    #[test]
    fn failed_terminal_write_never_reports_success_and_preserves_copies_for_recovery() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("source.txt");
        let target = dir.path().join("bound");
        std::fs::create_dir(&target).unwrap();
        std::fs::write(&source, b"synthetic source preserved").unwrap();
        std::fs::write(target.join("source.txt"), b"older target preserved").unwrap();
        let path = dir.path().join("db.sqlite3");
        let mut store = Store::open(&path).unwrap();
        let shelf = store.bind_directory(&target).unwrap();
        let job = store.begin_job(shelf, "synthetic job").unwrap();
        let published = store
            .copy_one(shelf, &source, &AtomicBool::new(false), |_, _| {})
            .unwrap();
        store
            .stage_job(job, &target.join("unpublished-staging-marker"))
            .unwrap();
        let blocker = rusqlite::Connection::open(&path).unwrap();
        blocker.execute_batch("CREATE TRIGGER synthetic_terminal_failure BEFORE UPDATE OF status ON jobs BEGIN SELECT RAISE(FAIL,'synthetic database write failure'); END;").unwrap();
        let store = Mutex::new(store);
        let result = finish_copy_job(&store, job, "completed", "复制完成；已完成1/1项");
        assert_eq!(result.status, "interrupted");
        assert!(!result.message.contains("复制完成"));
        assert!(result.message.contains("未能保存"));
        assert_eq!(
            store.lock().unwrap().snapshot().unwrap().jobs[0].status,
            "copying"
        );
        assert_eq!(
            std::fs::read(&source).unwrap(),
            b"synthetic source preserved"
        );
        assert_eq!(
            std::fs::read(&published).unwrap(),
            b"synthetic source preserved"
        );
        assert_eq!(
            std::fs::read(target.join("source.txt")).unwrap(),
            b"older target preserved"
        );
        blocker
            .execute_batch("DROP TRIGGER synthetic_terminal_failure;")
            .unwrap();
        drop(blocker);
        drop(store);
        let mut recovered = Store::open(&path).unwrap();
        assert_eq!(recovered.snapshot().unwrap().jobs[0].status, "interrupted");
        recovered.integrity_check().unwrap();
        assert_eq!(
            std::fs::read(&published).unwrap(),
            b"synthetic source preserved"
        );
    }
    #[test]
    fn persisted_terminal_payload_keeps_existing_contract() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(&dir.path().join("db.sqlite3")).unwrap();
        let id = store.begin_job(1, "queued").unwrap();
        let store = Mutex::new(store);
        let result = finish_copy_job(&store, id, "completed", "复制完成");
        let json = serde_json::to_value(result).unwrap();
        assert_eq!(json["job_id"], id);
        assert_eq!(json["status"], "completed");
        assert_eq!(json["message"], "复制完成");
        assert_eq!(
            store.lock().unwrap().snapshot().unwrap().jobs[0].status,
            "completed"
        );
    }
}
