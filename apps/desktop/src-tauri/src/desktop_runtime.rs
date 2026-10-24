use crate::{
    Runtime,
    desktop::{Layout, Rect, clamp_position},
    error,
    store::{Result, Shelf},
};
use serde::Serialize;
use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager};

pub struct Desktop {
    pub layout: Mutex<Layout>,
    path: PathBuf,
    writable: bool,
    warning: Mutex<Option<String>>,
}
#[derive(Serialize, Clone)]
pub struct Entry {
    pub id: i64,
    pub name: String,
    pub kind: String,
}
#[derive(Serialize, Clone)]
pub struct View {
    pub layout: Layout,
    pub entries: Vec<Entry>,
    pub total: usize,
    pub warning: Option<String>,
}

impl Desktop {
    fn load(root: &Path) -> Self {
        let path = root.join("desktop-layout-v1.json");
        let loaded = if !path.exists() {
            Ok(Layout::default())
        } else {
            std::fs::metadata(&path)
                .map_err(error)
                .and_then(|m| {
                    if m.len() > 65536 {
                        Err("布局文件过大。".into())
                    } else {
                        std::fs::read(&path).map_err(error)
                    }
                })
                .and_then(|bytes| serde_json::from_slice::<Layout>(&bytes).map_err(error))
                .and_then(|layout| {
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
fn shelves(app: &tauri::AppHandle) -> Result<Vec<Shelf>> {
    app.state::<Runtime>()
        .store
        .lock()
        .map_err(error)?
        .shelves()
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
        .map(|s| Entry {
            id: s.id,
            name: s.name.clone(),
            kind: s.kind.clone(),
        })
        .collect();
    Ok(View {
        total: layout.collapsed.len(),
        layout,
        entries,
        warning: state.warning.lock().map_err(error)?.clone(),
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
    let height = (data.entries.len() * 56 + 8 + if data.total > 5 { 24 } else { 0 }) as f64;
    let scale = window.scale_factor().map_err(error)?;
    let size = ((64.0 * scale).ceil() as u32, (height * scale).ceil() as u32);
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
    let position = clamp_position(
        initial,
        size,
        Rect {
            x: area.position.x,
            y: area.position.y,
            width: area.size.width,
            height: area.size.height,
        },
    );
    window
        .set_size(tauri::LogicalSize::new(64.0, height))
        .map_err(error)?;
    window
        .set_position(tauri::PhysicalPosition::new(position.0, position.1))
        .map_err(error)?;
    app.state::<Desktop>()
        .layout
        .lock()
        .map_err(error)?
        .entry_position = Some(position);
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
pub fn setup(app: &tauri::AppHandle, root: &Path) -> Result<()> {
    let state = Desktop::load(root);
    let catalog = shelves(app)?;
    {
        let mut l = state.layout.lock().map_err(error)?;
        l.collapsed.retain(|id| catalog.iter().any(|s| s.id == *id));
        if !catalog.iter().any(|s| s.id == l.active_shelf) {
            l.active_shelf = 1;
        }
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
                                let message = if result.job_id.is_some() {
                                    "复制任务已开始；来源保留。".into()
                                } else if result.errors.is_empty() {
                                    format!("已接收 {} 项；来源保留。", result.added)
                                } else {
                                    result.errors.join("；")
                                };
                                let _ = task.emit("desktop-imported", message);
                            }
                            Err(e) => report(&task, e),
                        }
                    });
                }
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
}
