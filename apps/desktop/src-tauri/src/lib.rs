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
async fn snapshot(app: tauri::AppHandle) -> Result<Snapshot> {
    database(app, Store::snapshot).await
}
#[tauri::command]
async fn choose_files(app: tauri::AppHandle) -> Result<Vec<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
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
async fn choose_folder(app: tauri::AppHandle) -> Result<Option<i64>> {
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
    let shelves = database(app.clone(), |s| s.shelves()).await?;
    let shelf = shelves
        .into_iter()
        .find(|s| s.id == shelf_id)
        .ok_or("文件架不存在。")?;
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
    let _ = app.emit(
        "copy-finished",
        serde_json::json!({"job_id":id,"status":status,"message":message}),
    );
}
#[tauri::command]
fn cancel_copy(app: tauri::AppHandle, job_id: i64) -> Result<()> {
    let state = app.state::<Runtime>();
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
async fn remove_reference(app: tauri::AppHandle, id: i64) -> Result<()> {
    database(app, move |s| s.remove_reference(id)).await
}
#[tauri::command]
async fn relocate_reference(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: i64,
    directory: bool,
) -> Result<bool> {
    let original = database(app.clone(), move |s| s.relocation_source(id)).await?;
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
    database(app, move |s| s.relink_reference(id, &original, &chosen)).await?;
    Ok(true)
}
#[tauri::command]
async fn set_tags(app: tauri::AppHandle, id: i64, tags: Vec<String>) -> Result<()> {
    database(app, move |s| s.set_tags(id, tags)).await
}
#[tauri::command]
async fn reorder(app: tauri::AppHandle, shelf_id: i64, ids: Vec<i64>) -> Result<()> {
    database(app, move |s| s.reorder(shelf_id, &ids)).await
}
#[tauri::command]
async fn thumbnail(app: tauri::AppHandle, id: i64) -> Result<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let path = state.store.lock().map_err(error)?.item_path(id)?;
        // ponytail: one bounded decoder at a time; use a measured worker pool if throughput needs it.
        let _slot = state.thumbnail.lock().map_err(error)?;
        store::thumbnail(&path)
    })
    .await
    .map_err(error)?
}
#[tauri::command]
async fn open_item(app: tauri::AppHandle, window: tauri::WebviewWindow, id: i64) -> Result<bool> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let target = state.store.lock().map_err(error)?.opening_target(id)?;
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
async fn reveal_item(app: tauri::AppHandle, id: i64) -> Result<()> {
    let path = database(app, move |s| s.item_path(id)).await?;
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
    if ids.is_empty() || ids.len() > 64 {
        return Err("请选择 1 至 64 项拖出。".into());
    }
    let paths: Vec<PathBuf> = {
        let state = app.state::<Runtime>();
        let store = state.store.lock().map_err(error)?;
        ids.into_iter()
            .map(|id| {
                store
                    .item_path(id)
                    .and_then(|p| store::canonical_user_path(&p))
            })
            .collect::<Result<_>>()?
    };
    let native_window = window.clone();
    window
        .run_on_main_thread(move || {
            let notify = native_window.clone();
            let result = drag::start_drag(
                &native_window,
                drag::DragItem::Files(paths),
                drag::Image::Raw(include_bytes!("../icons/32x32.png").to_vec()),
                move |result, _| {
                    let _ = notify.emit("native-drag-result", format!("{result:?}"));
                },
                drag::Options {
                    mode: drag::DragMode::Copy,
                    skip_animatation_on_cancel_or_failure: true,
                },
            );
            if let Err(e) = result {
                let _ = native_window.emit("native-drag-result", format!("拖出失败：{e}"));
            }
        })
        .map_err(error)
}
#[tauri::command]
fn toggle_topmost(window: tauri::WebviewWindow) -> Result<bool> {
    let value = !window.is_always_on_top().map_err(error)?;
    window.set_always_on_top(value).map_err(error)?;
    Ok(value)
}
#[tauri::command]
fn quit(app: tauri::AppHandle) -> Result<()> {
    let state = app.state::<Runtime>();
    if state.active.lock().map_err(error)?.is_some() {
        return Err("复制尚未结束，请先等待完成或取消。".into());
    }
    state.store.lock().map_err(error)?.clean_exit()?;
    app.exit(0);
    Ok(())
}
pub fn run() {
    tauri::Builder::default()
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
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    } else if event.id.as_ref() == "quit"
                        && let Err(message) = quit(app.clone())
                    {
                        app.dialog().message(message).title("尚未退出").show(|_| {});
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
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
            quit
        ])
        .run(tauri::generate_context!())
        .expect("柠猫文件工作站启动失败；数据未自动清理");
}
