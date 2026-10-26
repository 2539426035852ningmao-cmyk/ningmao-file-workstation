//! Owned native file windows reuse App/Store; labels never authorize an arbitrary shelf.
use crate::{
    desktop::{Rect, WindowGeometry, clamp_position, detached_id},
    desktop_runtime::{self, Desktop},
    error,
    store::Result,
};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};
struct Transition<'a>(&'a AtomicBool);
impl<'a> Transition<'a> {
    fn begin(state: &'a Desktop) -> Result<Self> {
        state
            .transitioning
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "正在调整文件架窗口，请稍候重试。")?;
        Ok(Self(&state.transitioning))
    }
}
impl Drop for Transition<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

pub fn scope(window: &tauri::WebviewWindow) -> Result<Option<i64>> {
    let state = window
        .app_handle()
        .try_state::<Desktop>()
        .ok_or("桌面控制层尚未就绪")?;
    state
        .layout
        .lock()
        .map_err(error)?
        .file_scope(window.label())
}
pub fn ids(app: &tauri::AppHandle) -> Result<Vec<i64>> {
    Ok(app
        .state::<Desktop>()
        .layout
        .lock()
        .map_err(error)?
        .detached
        .iter()
        .map(|s| s.shelf_id)
        .collect())
}
pub fn label_for(app: &tauri::AppHandle, id: i64) -> Result<String> {
    Ok(if ids(app)?.contains(&id) {
        format!("shelf-{id}")
    } else {
        "main".into()
    })
}
pub fn ensure(app: &tauri::AppHandle, id: i64) -> Result<tauri::WebviewWindow> {
    let label = label_for(app, id)?;
    if let Some(window) = app.get_webview_window(&label) {
        return Ok(window);
    }
    if label == "main" {
        return Err("主窗口不存在。".into());
    }
    let state = app.state::<Desktop>();
    let _creation = state.creating_window.lock().map_err(error)?;
    if let Some(window) = app.get_webview_window(&label) {
        return Ok(window);
    }
    desktop_runtime::known_shelf(app, id)?;
    let record = app
        .state::<Desktop>()
        .layout
        .lock()
        .map_err(error)?
        .detached
        .iter()
        .find(|s| s.shelf_id == id)
        .cloned()
        .ok_or("独立架归属已改变")?;
    let name = app
        .state::<crate::Runtime>()
        .store
        .lock()
        .map_err(error)?
        .shelf_catalog()?
        .into_iter()
        .find(|s| s.id == id)
        .ok_or("文件架不存在")?
        .name;
    let window =
        tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::App("index.html".into()))
            .visible(false)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .background_color(tauri::window::Color(0, 0, 0, 0))
            .title(format!("柠猫 · {name}"))
            .inner_size(420.0, 520.0)
            .min_inner_size(340.0, 320.0)
            .build()
            .map_err(error)?;
    restore(&window, record.geometry.as_ref())?;
    window.set_always_on_top(record.topmost).map_err(error)?;
    Ok(window)
}
pub fn restore(window: &tauri::WebviewWindow, geometry: Option<&WindowGeometry>) -> Result<()> {
    let initial = geometry
        .map(|g| (g.x, g.y))
        .or_else(|| window.outer_position().ok().map(|p| (p.x, p.y)))
        .unwrap_or((40, 80));
    let monitors = window.available_monitors().map_err(error)?;
    let monitor = window
        .monitor_from_point(f64::from(initial.0), f64::from(initial.1))
        .map_err(error)?
        .or_else(|| monitors.first().cloned())
        .ok_or("没有可用显示器")?;
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    window
        .set_position(tauri::PhysicalPosition::new(initial.0, initial.1))
        .map_err(error)?;
    if let Some(g) = geometry {
        let w = g.width.min((f64::from(area.size.width) / scale).max(340.0));
        let h = g
            .height
            .min((f64::from(area.size.height) / scale).max(320.0));
        window
            .set_size(tauri::LogicalSize::new(w, h))
            .map_err(error)?;
    }
    let size = window.outer_size().map_err(error)?;
    let p = clamp_position(
        initial,
        (size.width, size.height),
        Rect {
            x: area.position.x,
            y: area.position.y,
            width: area.size.width,
            height: area.size.height,
        },
    );
    window
        .set_position(tauri::PhysicalPosition::new(p.0, p.1))
        .map_err(error)
}
pub fn capture(window: &tauri::Window) {
    if window.label() != "main" && detached_id(window.label()).is_none() {
        return;
    }
    let Some(state) = window.app_handle().try_state::<Desktop>() else {
        return;
    };
    if window.is_minimized().unwrap_or(true) || window.is_maximized().unwrap_or(true) {
        return;
    }
    let (Ok(p), Ok(size), Ok(scale)) = (
        window.outer_position(),
        window.inner_size(),
        window.scale_factor(),
    ) else {
        return;
    };
    let geometry = WindowGeometry {
        x: p.x,
        y: p.y,
        width: f64::from(size.width) / scale,
        height: f64::from(size.height) / scale,
    };
    if !geometry.validate() {
        return;
    }
    let topmost = window.is_always_on_top().ok();
    if let Ok(mut l) = state.layout.lock() {
        if window.label() == "main" {
            l.main_geometry = Some(geometry);
            if let Some(value) = topmost {
                l.main_topmost = value;
            }
        } else if let Some(record) = l
            .detached
            .iter_mut()
            .find(|r| Some(r.shelf_id) == detached_id(window.label()))
        {
            record.geometry = Some(geometry);
            record.topmost = topmost.unwrap_or(record.topmost);
        }
    }
}
pub fn hidden(window: &tauri::Window) {
    capture(window);
    if let Some(state) = window.app_handle().try_state::<Desktop>()
        && let Ok(mut l) = state.layout.lock()
    {
        if window.label() == "main" {
            l.expanded = false;
        } else if let Some(record) = l
            .detached
            .iter_mut()
            .find(|r| Some(r.shelf_id) == detached_id(window.label()))
        {
            record.visible = false;
        }
    }
}
pub fn capture_all(app: &tauri::AppHandle) {
    for window in app.webview_windows().values() {
        capture(&window.as_ref().window());
    }
}
pub fn show_main(app: &tauri::AppHandle) -> Result<()> {
    let id = desktop_runtime::active_shelf(app)?;
    if id > 0 {
        return desktop_runtime::open(app, id, true);
    }
    let main = app.get_webview_window("main").ok_or("主窗口不存在")?;
    main.unminimize().map_err(error)?;
    main.show().map_err(error)?;
    main.set_focus().map_err(error)?;
    app.state::<Desktop>()
        .layout
        .lock()
        .map_err(error)?
        .expanded = true;
    desktop_runtime::publish(app)
}
pub fn detach(app: &tauri::AppHandle, id: i64) -> Result<()> {
    desktop_runtime::require_idle(app)?;
    desktop_runtime::known_shelf(app, id)?;
    capture_all(app);
    let state = app.state::<Desktop>();
    let _transition = Transition::begin(&state)?;
    let old = state.layout.lock().map_err(error)?.clone();
    let catalog = app
        .state::<crate::Runtime>()
        .store
        .lock()
        .map_err(error)?
        .shelf_catalog()?
        .into_iter()
        .map(|s| s.id)
        .collect::<Vec<_>>();
    state.layout.lock().map_err(error)?.detach(id, &catalog)?;
    let created = ensure(app, id).and_then(|w| {
        w.show().map_err(error)?;
        w.set_focus().map_err(error)?;
        Ok(w)
    });
    if let Err(e) = created {
        if let Some(w) = app.get_webview_window(&format!("shelf-{id}")) {
            let _ = w.destroy();
        }
        *state.layout.lock().map_err(error)? = old;
        return Err(e);
    }
    let active = state.layout.lock().map_err(error)?.active_shelf;
    let _ = app.emit_to("main", "desktop-activate-shelf", active);
    let _ = app.emit("workstation-changed", ());
    let _ = state.save();
    desktop_runtime::entry_geometry(app)?;
    desktop_runtime::publish(app)
}
pub fn merge(app: &tauri::AppHandle, id: i64) -> Result<()> {
    desktop_runtime::require_idle(app)?;
    desktop_runtime::known_shelf(app, id)?;
    capture_all(app);
    let state = app.state::<Desktop>();
    let transition = Transition::begin(&state)?;
    let old = state.layout.lock().map_err(error)?.clone();
    state.layout.lock().map_err(error)?.merge(id)?;
    if let Some(window) = app.get_webview_window(&format!("shelf-{id}"))
        && let Err(e) = window.destroy()
    {
        *state.layout.lock().map_err(error)? = old;
        return Err(error(e));
    }
    drop(transition);
    let result = desktop_runtime::open(app, id, true);
    let _ = state.save();
    let _ = app.emit("workstation-changed", ());
    let _ = desktop_runtime::publish(app);
    result
}
