use crate::{
    Runtime,
    desktop::{Edge, Layout, Preferences, Rect, clamp_position, contains_point, entry_placement},
    error,
    store::{Result, ShelfIdentity},
};
use serde::Serialize;
use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};

pub struct Desktop {
    pub layout: Mutex<Layout>,
    path: PathBuf,
    writable: bool,
    warning: Mutex<Option<String>>,
    hover: Mutex<HoverState>,
}
struct HoverState {
    inside: bool,
    last_leave: Instant,
    worker_running: bool,
}
#[derive(Serialize, Clone)]
pub struct View {
    pub layout: Layout,
    pub entries: Vec<ShelfIdentity>,
    pub total: usize,
    pub warning: Option<String>,
    pub copying: bool,
    pub edge_hidden: bool,
}

impl Desktop {
    fn load(root: &Path) -> Self {
        let path = root.join("desktop-layout-v2.json");
        let source = if path.exists() {
            path.clone()
        } else {
            root.join("desktop-layout-v1.json")
        };
        let legacy = source != path;
        let loaded = if !source.exists() {
            Ok(Layout::default())
        } else {
            std::fs::metadata(&source)
                .map_err(error)
                .and_then(|m| {
                    if m.len() > 65536 {
                        Err("布局文件过大。".into())
                    } else {
                        std::fs::read(&source).map_err(error)
                    }
                })
                .and_then(|bytes| serde_json::from_slice::<Layout>(&bytes).map_err(error))
                .and_then(|mut layout| {
                    if legacy {
                        if layout.version != 1 {
                            return Err("旧布局版本不兼容，原文件已保留。".into());
                        }
                        layout.version = 2;
                    }
                    if layout.validate() {
                        Ok(layout)
                    } else {
                        Err("布局版本或内容不兼容。".into())
                    }
                })
        };
        let (layout, writable, warning) = match loaded {
            Ok(layout) => (layout, true, None),
            Err(_) => (
                Layout::default(),
                false,
                Some("入口布局无法读取或版本不兼容；原文件保留，本次更改仅临时生效。".into()),
            ),
        };
        Self {
            layout: Mutex::new(layout),
            path,
            writable,
            warning: Mutex::new(warning),
            hover: Mutex::new(HoverState {
                inside: false,
                last_leave: Instant::now(),
                worker_running: false,
            }),
        }
    }
    pub fn save(&self) -> Result<()> {
        if !self.writable {
            return Ok(());
        }
        let layout = self.layout.lock().map_err(error)?;
        let result = (|| {
            let mut file =
                tempfile::NamedTempFile::new_in(self.path.parent().ok_or("缺少布局目录")?)
                    .map_err(error)?;
            file.write_all(&serde_json::to_vec_pretty(&*layout).map_err(error)?)
                .map_err(error)?;
            file.as_file().sync_all().map_err(error)?;
            file.persist(&self.path).map_err(error)?;
            Ok(())
        })();
        if result.is_err() {
            *self.warning.lock().map_err(error)? =
                Some("入口布局未能保存；当前仍可使用，下次启动可能恢复旧位置。".into());
        }
        result
    }
}
fn shelves(app: &tauri::AppHandle) -> Result<Vec<ShelfIdentity>> {
    app.state::<Runtime>()
        .store
        .lock()
        .map_err(error)?
        .shelf_catalog()
}
fn known_shelf(app: &tauri::AppHandle, id: i64) -> Result<()> {
    if shelves(app)?.iter().any(|s| s.id == id) {
        Ok(())
    } else {
        Err("文件架不存在，请刷新后重试。".into())
    }
}
fn require_idle(app: &tauri::AppHandle) -> Result<()> {
    if app
        .state::<Desktop>()
        .layout
        .lock()
        .map_err(error)?
        .is_dragging()
    {
        Err("正在投放文件，请先完成或取消拖入。".into())
    } else {
        Ok(())
    }
}
pub fn view(app: &tauri::AppHandle) -> Result<View> {
    let state = app.state::<Desktop>();
    let layout = state.layout.lock().map_err(error)?.clone();
    let catalog = shelves(app)?;
    let entries = layout
        .visible_ids()
        .iter()
        .filter_map(|id| catalog.iter().find(|s| s.id == *id))
        .cloned()
        .collect();
    Ok(View {
        total: layout.collapsed.len(),
        edge_hidden: layout.edge_hidden,
        layout,
        entries,
        warning: state.warning.lock().map_err(error)?.clone(),
        copying: app
            .state::<Runtime>()
            .active
            .lock()
            .map_err(error)?
            .is_some(),
    })
}
fn report(app: &tauri::AppHandle, message: String) {
    let _ = app.emit("desktop-error", message);
}
fn publish(app: &tauri::AppHandle) -> Result<()> {
    let data = view(app)?;
    app.emit("desktop-updated", data).map_err(error)
}
fn entry_geometry(app: &tauri::AppHandle) -> Result<()> {
    let window = app
        .get_webview_window("desktop-entry")
        .ok_or("悬浮入口尚未创建")?;
    let data = view(app)?;
    if !data.layout.enabled || data.entries.is_empty() {
        window.hide().map_err(error)?;
        return publish(app);
    }
    let monitors = window.available_monitors().map_err(error)?;
    let initial = data.layout.entry_position.unwrap_or_else(|| {
        app.get_webview_window("main")
            .and_then(|w| w.outer_position().ok())
            .map(|p| (p.x.saturating_sub(80), p.y))
            .unwrap_or((16, 120))
    });
    let monitor = window
        .monitor_from_point(f64::from(initial.0), f64::from(initial.1))
        .map_err(error)?
        .or_else(|| monitors.first().cloned())
        .ok_or("没有可用显示器，文件架保持展开")?;
    let area = monitor.work_area();
    let placement = entry_placement(
        initial,
        Rect {
            x: area.position.x,
            y: area.position.y,
            width: area.size.width,
            height: area.size.height,
        },
        monitor.scale_factor(),
        data.entries.len(),
        data.total,
        data.layout.preferences.edge,
        data.layout.edge_hidden,
    );
    window
        .set_size(tauri::LogicalSize::new(
            placement.logical_size.0,
            placement.logical_size.1,
        ))
        .map_err(error)?;
    window
        .set_position(tauri::PhysicalPosition::new(
            placement.position.0,
            placement.position.1,
        ))
        .map_err(error)?;
    app.state::<Desktop>()
        .layout
        .lock()
        .map_err(error)?
        .entry_position = Some(placement.anchor);
    window
        .set_always_on_top(data.layout.preferences.topmost)
        .map_err(error)?;
    window.show().map_err(error)?;
    publish(app)
}
pub fn collapse(app: &tauri::AppHandle, id: i64) -> Result<()> {
    require_idle(app)?;
    known_shelf(app, id)?;
    let state = app.state::<Desktop>();
    let old = state.layout.lock().map_err(error)?.clone();
    if old.collapsed.len() >= 256 && !old.collapsed.contains(&id) {
        return Err("基础Dock最多收纳256架。".into());
    }
    state.layout.lock().map_err(error)?.collapse(id);
    state.layout.lock().map_err(error)?.fold_entry();
    if let Err(e) = entry_geometry(app) {
        *state.layout.lock().map_err(error)? = old;
        return Err(e);
    }
    app.get_webview_window("main")
        .ok_or("主文件架不存在")?
        .hide()
        .map_err(error)?;
    let _ = state.save();
    publish(app)
}
pub fn open(app: &tauri::AppHandle, id: i64, focus: bool) -> Result<()> {
    if focus {
        require_idle(app)?;
    }
    known_shelf(app, id)?;
    let state = app.state::<Desktop>();
    {
        let mut layout = state.layout.lock().map_err(error)?;
        if focus {
            layout.open(id);
        } else {
            layout.active_shelf = id;
            layout.expanded = true;
        }
    }
    let main = app.get_webview_window("main").ok_or("主文件架不存在")?;
    if !focus && let Some(entry) = app.get_webview_window("desktop-entry") {
        let p = entry.outer_position().map_err(error)?;
        let entry_size = entry.outer_size().map_err(error)?;
        let main_size = main.outer_size().map_err(error)?;
        if let Some(monitor) = entry.current_monitor().map_err(error)? {
            let area = monitor.work_area();
            let x = if i64::from(p.x) + i64::from(entry_size.width) + 8 + i64::from(main_size.width)
                <= i64::from(area.position.x) + i64::from(area.size.width)
            {
                p.x.saturating_add(entry_size.width as i32)
                    .saturating_add(8)
            } else {
                p.x.saturating_sub(main_size.width as i32).saturating_sub(8)
            };
            let pos = clamp_position(
                (x, p.y),
                (main_size.width, main_size.height),
                Rect {
                    x: area.position.x,
                    y: area.position.y,
                    width: area.size.width,
                    height: area.size.height,
                },
            );
            main.set_position(tauri::PhysicalPosition::new(pos.0, pos.1))
                .map_err(error)?;
        }
    }
    app.emit_to("main", "desktop-activate-shelf", id)
        .map_err(error)?;
    main.show().map_err(error)?;
    if focus {
        main.set_focus().map_err(error)?;
        entry_geometry(app)?;
        let _ = state.save();
    }
    publish(app)
}
pub fn active_shelf(app: &tauri::AppHandle) -> Result<i64> {
    Ok(app
        .state::<Desktop>()
        .layout
        .lock()
        .map_err(error)?
        .active_shelf)
}
pub fn select(app: &tauri::AppHandle, id: i64) -> Result<()> {
    require_idle(app)?;
    known_shelf(app, id)?;
    app.state::<Desktop>()
        .layout
        .lock()
        .map_err(error)?
        .active_shelf = id;
    publish(app)
}
pub fn page(app: &tauri::AppHandle, delta: i32) -> Result<()> {
    let state = app.state::<Desktop>();
    {
        let mut l = state.layout.lock().map_err(error)?;
        if l.is_dragging() {
            return Err("投放文件时不能翻页，请先完成拖入。".into());
        }
        let max = l.collapsed.len().saturating_sub(1) / 5;
        l.page = (l.page as i64 + i64::from(delta.signum())).clamp(0, max as i64) as usize;
    }
    entry_geometry(app)?;
    let _ = state.save();
    Ok(())
}
pub fn disable(app: &tauri::AppHandle) -> Result<()> {
    let id = active_shelf(app)?;
    open(app, id, true)?;
    let state = app.state::<Desktop>();
    {
        let mut l = state.layout.lock().map_err(error)?;
        l.enabled = false;
        l.collapsed.clear();
    }
    entry_geometry(app)?;
    let _ = state.save();
    Ok(())
}
pub fn configure(app: &tauri::AppHandle, preferences: Preferences) -> Result<bool> {
    require_idle(app)?;
    if preferences.edge == Edge::Free && preferences.auto_hide {
        return Err("请先选择左侧或右侧贴边，再启用自动收起。".into());
    }
    let state = app.state::<Desktop>();
    let old = state.layout.lock().map_err(error)?.clone();
    {
        let mut l = state.layout.lock().map_err(error)?;
        l.preferences = preferences;
        l.edge_hidden = false;
        l.fold_entry();
    }
    if let Err(e) = entry_geometry(app) {
        *state.layout.lock().map_err(error)? = old;
        let _ = entry_geometry(app);
        return Err(e);
    }
    let saved = state.writable && state.save().is_ok();
    publish(app)?;
    Ok(saved)
}
pub fn hover(app: &tauri::AppHandle, inside: bool) -> Result<()> {
    let state = app.state::<Desktop>();
    let can_fold = {
        let l = state.layout.lock().map_err(error)?;
        l.enabled && !l.edge_hidden && l.preferences.edge != Edge::Free && l.preferences.auto_hide
    };
    let spawn = {
        let mut h = state.hover.lock().map_err(error)?;
        h.inside = inside;
        if inside {
            false
        } else {
            h.last_leave = Instant::now();
            if h.worker_running || !can_fold {
                false
            } else {
                h.worker_running = true;
                true
            }
        }
    };
    if inside {
        let changed = {
            let mut l = state.layout.lock().map_err(error)?;
            let old = l.edge_hidden;
            l.edge_hidden = false;
            old
        };
        if changed {
            entry_geometry(app)?;
        }
    }
    if spawn {
        let task = app.clone();
        // One sleeping worker per burst, no idle polling and no new timer dependency.
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(Duration::from_millis(650));
                let state = task.state::<Desktop>();
                let Ok(mut h) = state.hover.lock() else {
                    return;
                };
                if h.inside {
                    h.worker_running = false;
                    return;
                }
                if h.last_leave.elapsed() < Duration::from_millis(650) {
                    continue;
                }
                h.worker_running = false;
                drop(h);
                let gui = task.clone();
                let _ = task.run_on_main_thread(move || {
                    let state = gui.state::<Desktop>();
                    let ready = state
                        .hover
                        .lock()
                        .map(|h| !h.inside && h.last_leave.elapsed() >= Duration::from_millis(650))
                        .unwrap_or(false);
                    // OLE drop can finish without a DOM pointer-enter; check actual hover once.
                    let pointer_inside = (|| -> Result<bool> {
                        let window = gui
                            .get_webview_window("desktop-entry")
                            .ok_or("入口未就绪")?;
                        let cursor = window.cursor_position().map_err(error)?;
                        let p = window.outer_position().map_err(error)?;
                        let size = window.outer_size().map_err(error)?;
                        Ok(contains_point(
                            Rect {
                                x: p.x,
                                y: p.y,
                                width: size.width,
                                height: size.height,
                            },
                            (cursor.x, cursor.y),
                        ))
                    })()
                    .unwrap_or(true);
                    if ready
                        && !pointer_inside
                        && state
                            .layout
                            .lock()
                            .map(|mut l| l.fold_entry())
                            .unwrap_or(false)
                        && let Err(e) = entry_geometry(&gui)
                    {
                        report(&gui, e);
                    }
                });
                return;
            }
        });
    }
    Ok(())
}
pub fn move_entry(window: &tauri::WebviewWindow) -> Result<()> {
    let state = window.app_handle().state::<Desktop>();
    let layout = state.layout.lock().map_err(error)?;
    if layout.is_dragging() {
        return Err("请先完成文件投放。".into());
    }
    if layout.preferences.edge != Edge::Free {
        return Err("贴边模式已固定入口；请在管理中心切换为自由悬浮后移动。".into());
    }
    drop(layout);
    window.start_dragging().map_err(error)
}
pub fn notify(app: &tauri::AppHandle) {
    let _ = publish(app);
}
pub fn manager_open(app: &tauri::AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window("manager") {
        window.unminimize().map_err(error)?;
        window.show().map_err(error)?;
        return window.set_focus().map_err(error);
    }
    let window = tauri::WebviewWindowBuilder::new(
        app,
        "manager",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("柠猫文件工作站 · 管理中心")
    .visible(false)
    .inner_size(1040.0, 720.0)
    .min_inner_size(760.0, 520.0)
    .build()
    .map_err(error)?;
    if let Some(monitor) = window.current_monitor().map_err(error)? {
        let area = monitor.work_area();
        let size = window.outer_size().map_err(error)?;
        let p = window.outer_position().map_err(error)?;
        let pos = clamp_position(
            (p.x, p.y),
            (size.width, size.height),
            Rect {
                x: area.position.x,
                y: area.position.y,
                width: area.size.width,
                height: area.size.height,
            },
        );
        window
            .set_position(tauri::PhysicalPosition::new(pos.0, pos.1))
            .map_err(error)?;
    }
    window.show().map_err(error)?;
    window.set_focus().map_err(error)
}
pub fn setup(app: &tauri::AppHandle, root: &Path) -> Result<()> {
    let state = Desktop::load(root);
    let catalog = shelves(app)?;
    {
        let mut l = state.layout.lock().map_err(error)?;
        l.collapsed.retain(|id| catalog.iter().any(|s| s.id == *id));
        if !catalog.iter().any(|s| s.id == l.active_shelf) {
            l.active_shelf = 1;
        }
        l.fold_entry();
    }
    app.manage(state);
    tauri::WebviewWindowBuilder::new(
        app,
        "desktop-entry",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("柠猫悬浮入口")
    .visible(false)
    .decorations(false)
    .resizable(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .transparent(true)
    .inner_size(64.0, 64.0)
    .build()
    .map_err(error)?;
    let data = view(app)?;
    if data.layout.enabled {
        entry_geometry(app)?;
        if !data.layout.expanded && !data.entries.is_empty() {
            app.get_webview_window("main")
                .ok_or("主窗口不存在")?
                .hide()
                .map_err(error)?;
        }
    }
    Ok(())
}
pub fn webview_event(webview: &tauri::Webview, event: &tauri::WebviewEvent) {
    if webview.label() != "desktop-entry" {
        return;
    }
    let tauri::WebviewEvent::DragDrop(event) = event else {
        return;
    };
    let app = webview.app_handle().clone();
    let result = (|| -> Result<()> {
        let state = app.state::<Desktop>();
        let scale = webview.window().scale_factor().map_err(error)?;
        match event {
            tauri::DragDropEvent::Enter { position, .. } => {
                state.layout.lock().map_err(error)?.begin_drag();
                entry_geometry(&app)?;
                let target = state
                    .layout
                    .lock()
                    .map_err(error)?
                    .hover_target(position.y, scale);
                if let Some(id) = target {
                    open(&app, id, false)?;
                }
            }
            tauri::DragDropEvent::Over { position } => {
                let target = state
                    .layout
                    .lock()
                    .map_err(error)?
                    .hover_target(position.y, scale);
                if let Some(id) = target
                    && active_shelf(&app)? != id
                {
                    open(&app, id, false)?;
                }
            }
            tauri::DragDropEvent::Leave => {
                state.layout.lock().map_err(error)?.cancel_drag();
                publish(&app)?;
                hover(&app, false)?;
            }
            tauri::DragDropEvent::Drop { paths, position } => {
                let target = state
                    .layout
                    .lock()
                    .map_err(error)?
                    .drop_target(position.y, scale);
                if let Some(id) = target {
                    let paths = paths
                        .iter()
                        .map(|p| {
                            p.to_str()
                                .map(str::to_owned)
                                .ok_or("不支持此路径编码。".to_string())
                        })
                        .collect::<Result<Vec<_>>>()?;
                    let task = app.clone();
                    tauri::async_runtime::spawn(async move {
                        match crate::run_import(task.clone(), id, paths).await {
                            Ok(result) => {
                                if !result.errors.is_empty() {
                                    report(&task, result.errors.join("；"));
                                }
                                let message = if result.job_id.is_some() {
                                    "复制任务已开始；来源保留。".into()
                                } else {
                                    format!("已接收 {} 项；来源保留。", result.added)
                                };
                                let _ = task.emit("desktop-imported", message);
                            }
                            Err(e) => report(&task, e),
                        }
                    });
                }
                hover(&app, false)?;
            }
            _ => {}
        }
        Ok(())
    })();
    if let Err(e) = result {
        report(&app, e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn view_exposes_fold_state_but_saved_layout_excludes_transient_state() {
        let mut layout = Layout::default();
        layout.collapse(1);
        layout.preferences.edge = Edge::Left;
        layout.preferences.auto_hide = true;
        layout.fold_entry();
        let json = serde_json::to_value(View {
            edge_hidden: layout.edge_hidden,
            layout,
            entries: vec![],
            total: 1,
            warning: None,
            copying: true,
        })
        .unwrap();
        assert_eq!(json["edge_hidden"], true);
        assert_eq!(json["copying"], true);
        assert!(json["layout"].get("edge_hidden").is_none());
        assert!(json["layout"].get("drag_ids").is_none());
        assert_eq!(json["layout"]["preferences"]["edge"], "left");
    }
    #[test]
    fn desktop_layout_persists_and_future_or_corrupt_files_are_preserved() {
        let root = tempfile::tempdir().unwrap();
        let state = Desktop::load(root.path());
        {
            let mut layout = state.layout.lock().unwrap();
            layout.collapse(7);
            layout.entry_position = Some((-1200, 80));
        }
        state.save().unwrap();
        let restored = Desktop::load(root.path());
        assert_eq!(restored.layout.lock().unwrap().collapsed, vec![7]);
        assert_eq!(
            restored.layout.lock().unwrap().entry_position,
            Some((-1200, 80))
        );
        for bytes in [b"{\"version\":99}".as_slice(), b"not json".as_slice()] {
            std::fs::write(&state.path, bytes).unwrap();
            let fallback = Desktop::load(root.path());
            assert!(!fallback.writable);
            assert!(fallback.warning.lock().unwrap().is_some());
            fallback.layout.lock().unwrap().collapse(8);
            fallback.save().unwrap();
            assert_eq!(std::fs::read(&state.path).unwrap(), bytes);
        }
    }
    #[test]
    fn legacy_layout_migrates_to_separate_file_without_overwriting_v1() {
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join("desktop-layout-v1.json");
        let bytes=br#"{"version":1,"enabled":true,"expanded":false,"active_shelf":2,"collapsed":[2],"entry_position":[-1200,90]}"#;
        std::fs::write(&legacy, bytes).unwrap();
        let state = Desktop::load(root.path());
        assert!(state.writable);
        assert_eq!(state.layout.lock().unwrap().collapsed, vec![2]);
        assert_eq!(state.layout.lock().unwrap().version, 2);
        state.save().unwrap();
        assert!(root.path().join("desktop-layout-v2.json").is_file());
        assert_eq!(std::fs::read(legacy).unwrap(), bytes);
    }
}
