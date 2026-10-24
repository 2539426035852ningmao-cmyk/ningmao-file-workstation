pub mod desktop;
mod desktop_runtime;
mod shelf_windows;
pub mod store;
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

struct Runtime {
    store: Mutex<Store>,
    active: Mutex<Option<(i64, Arc<AtomicBool>)>>,
    thumbnail: Mutex<()>,
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
    if let Ok(mut store) = state.store.lock() {
        let _ = store.finish_job(id, status, &message);
    }
    if let Ok(mut active) = state.active.lock() {
        *active = None;
    }
    desktop_runtime::notify(&app);
    let _ = app.emit(
        "copy-finished",
        serde_json::json!({"job_id":id,"status":status,"message":message}),
    );
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
    scoped_database(app, scope, vec![id], move |s| s.remove_reference(id)).await
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
fn desktop_move(window: tauri::WebviewWindow) -> Result<()> {
    if window.label() != "desktop-entry" {
        return Err("未知悬浮入口。".into());
    }
    desktop_runtime::move_entry(&window)
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
                _process_lock: lock,
            });
            desktop_runtime::setup(app.handle(), &root).map_err(std::io::Error::other)?;
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
                && let Ok(mut layout) = state.layout.lock()
                && layout.preferences.edge == desktop::Edge::Free
            {
                layout.entry_position = Some((position.x, position.y));
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
        .on_webview_event(desktop_runtime::webview_event)
        .invoke_handler(tauri::generate_handler![
            snapshot,
            choose_files,
            choose_folder,
            import_paths,
            cancel_copy,
            remove_reference,
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
            desktop_state,
            desktop_collapse,
            desktop_open,
            desktop_select,
            desktop_page,
            desktop_move,
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
