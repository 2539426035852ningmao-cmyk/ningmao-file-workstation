//! App-owned native contours and bounded window movement. No global input hooks.
use crate::{
    desktop::{Edge, Layout, Rect},
    entry::{EntryState, Kind},
    error,
    store::Result,
};
use serde::Serialize;
use std::{
    collections::HashSet,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
#[derive(Clone, Debug)]
pub struct Contour {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub radius: f64,
}
impl Contour {
    pub fn raster_bounds(&self, scale: f64) -> [i32; 6] {
        // HRGN is a binary outer mask, not the visual edge. Preserve Chromium's
        // partially covered edge pixels with three physical pixels of raster guard (GDI ellipse quantization).
        // Semantic drop slots remain unchanged; this guard cannot select a shelf.
        let pad = 3;
        [
            (self.x * scale).floor() as i32 - pad,
            (self.y * scale).floor() as i32 - pad,
            ((self.x + self.width) * scale).ceil() as i32 + pad,
            ((self.y + self.height) * scale).ceil() as i32 + pad,
            (self.radius * 2.0 * scale).round() as i32 + 2 * pad,
            (self.radius * 2.0 * scale).round() as i32 + 2 * pad,
        ]
    }
    pub fn contains(&self, x: f64, y: f64) -> bool {
        if x < self.x || y < self.y || x >= self.x + self.width || y >= self.y + self.height {
            return false;
        }
        let r = self.radius.min(self.width / 2.0).min(self.height / 2.0);
        let cx = x.clamp(self.x + r, self.x + self.width - r);
        let cy = y.clamp(self.y + r, self.y + self.height - r);
        (x - cx).powi(2) + (y - cy).powi(2) <= r * r
    }
}
pub fn contours(entry: &EntryState, layout: &Layout) -> Vec<Contour> {
    let g = entry.geometry(layout);
    if layout.edge_hidden {
        return vec![Contour {
            x: 0.0,
            y: 0.0,
            width: g.width,
            height: g.height,
            radius: 7.0,
        }];
    }
    let mut shapes = g
        .slots
        .iter()
        .map(|s| Contour {
            x: s.x,
            y: s.y,
            width: s.width,
            height: s.height,
            radius: if s.width == 300.0 { 20.0 } else { 24.0 },
        })
        .collect::<Vec<_>>();
    if entry.presentation.kind == Kind::Capsule
        && entry.close_growth > 0.01
        && let Some(s) = g.slots.first()
    {
        let radius = 13.0 * entry.close_growth;
        let cy = if entry.close_lower {
            s.y + s.height + 2.0
        } else {
            s.y - 2.0
        };
        shapes.push(Contour {
            x: s.x + s.width - 13.0 - radius,
            y: cy - radius,
            width: radius * 2.0,
            height: radius * 2.0,
            radius,
        });
    }
    if layout.collapsed.len() > 5 {
        shapes.push(Contour {
            x: 8.0,
            y: g.height - 20.0,
            width: g.width - 16.0,
            height: 16.0,
            radius: 8.0,
        });
    }
    shapes
}
// Physical window position, logical visible bounds. Window padding is not a target.
pub fn snap(
    initial: (i32, i32),
    area: Rect,
    scale: f64,
    bounds: (f64, f64, f64, f64),
    magnet: bool,
) -> ((i32, i32), bool) {
    let s = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let (x, y, w, h) = bounds;
    let gap = 6.0 * s;
    let threshold = 18.0 * s;
    let left = f64::from(area.x) + gap - x * s;
    let top = f64::from(area.y) + gap - y * s;
    let right = f64::from(area.x) + f64::from(area.width) - gap - (x + w) * s;
    let bottom = f64::from(area.y) + f64::from(area.height) - gap - (y + h) * s;
    let mut px = f64::from(initial.0).clamp(left, right.max(left));
    let mut py = f64::from(initial.1).clamp(top, bottom.max(top));
    if magnet {
        if (px - left).abs() <= threshold + 0.5 {
            px = left;
        } else if (px - right).abs() <= threshold + 0.5 {
            px = right;
        }
        if (py - top).abs() <= threshold + 0.5 {
            py = top;
        } else if (py - bottom).abs() <= threshold + 0.5 {
            py = bottom;
        }
    }
    (
        (px.round() as i32, py.round() as i32),
        (py - top).abs() < 1.0,
    )
}
pub fn visible_bounds(entry: &EntryState, layout: &Layout) -> (f64, f64, f64, f64) {
    let g = entry.geometry(layout);
    if layout.edge_hidden || g.slots.is_empty() {
        return (0.0, 0.0, g.width, g.height);
    }
    let (x, y, r, b) =
        g.slots
            .iter()
            .fold((f64::MAX, f64::MAX, 0.0_f64, 0.0_f64), |(x, y, r, b), s| {
                (
                    x.min(s.x),
                    y.min(s.y),
                    r.max(s.x + s.width),
                    b.max(s.y + s.height),
                )
            });
    (x, y, r - x, b - y)
}
pub fn place(
    initial: (i32, i32),
    area: Rect,
    scale: f64,
    entry: &EntryState,
    layout: &Layout,
) -> ((i32, i32), bool) {
    if layout.edge_hidden {
        return (
            crate::entry::place(
                initial,
                area,
                scale,
                (entry.geometry(layout).width, entry.geometry(layout).height),
                layout.preferences.edge,
            ),
            false,
        );
    }
    let bounds = visible_bounds(entry, layout);
    let s = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let gap = 6.0 * s;
    let mut p = initial;
    match layout.preferences.edge {
        Edge::Left => p.0 = (f64::from(area.x) + gap - bounds.0 * s).round() as i32,
        Edge::Right => {
            p.0 = (f64::from(area.x) + f64::from(area.width) - gap - (bounds.0 + bounds.2) * s)
                .round() as i32
        }
        Edge::Top => p.1 = (f64::from(area.y) + gap - bounds.1 * s).round() as i32,
        Edge::Bottom => {
            p.1 = (f64::from(area.y) + f64::from(area.height) - gap - (bounds.1 + bounds.3) * s)
                .round() as i32
        }
        Edge::Free => {}
    }
    snap(p, area, s, bounds, false)
}
pub fn apply(window: &tauri::WebviewWindow, entry: &EntryState, layout: &Layout) -> Result<()> {
    if entry.busy() {
        return Ok(());
    }
    #[cfg(windows)]
    {
        use windows::Win32::{
            Foundation::HWND,
            Graphics::Gdi::{
                CombineRgn, CreateRoundRectRgn, DeleteObject, HGDIOBJ, RGN_OR, SetWindowRgn,
            },
        };
        let scale = window.scale_factor().map_err(error)?;
        let shapes = contours(entry, layout);
        let hwnd = HWND(window.hwnd().map_err(error)?.0 as _);
        unsafe {
            let union = CreateRoundRectRgn(0, 0, 0, 0, 0, 0);
            if union.0.is_null() {
                return Err("无法创建入口轮廓，未扩大点击区域。".into());
            }
            for s in shapes {
                let [x, y, r, b, rx, ry] = s.raster_bounds(scale);
                let r = CreateRoundRectRgn(x, y, r, b, rx, ry);
                if r.0.is_null() {
                    let _ = DeleteObject(HGDIOBJ(union.0));
                    return Err("无法创建入口子轮廓。".into());
                }
                let combined = CombineRgn(Some(union), Some(union), Some(r), RGN_OR);
                let _ = DeleteObject(HGDIOBJ(r.0));
                if combined.0 == 0 {
                    let _ = DeleteObject(HGDIOBJ(union.0));
                    return Err("入口轮廓组合失败。".into());
                }
            }
            if SetWindowRgn(hwnd, Some(union), true) == 0 {
                let _ = DeleteObject(HGDIOBJ(union.0));
                return Err("入口原生轮廓设置失败。".into());
            } // Success transfers region ownership to Windows.
        }
    }
    #[cfg(not(windows))]
    let _ = (window, entry, layout);
    Ok(())
}
static MOVING: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
pub fn moving(label: &str) -> bool {
    MOVING
        .get_or_init(Default::default)
        .lock()
        .map(|s| s.contains(label))
        .unwrap_or(true)
}
fn begin(window: &tauri::WebviewWindow) -> Result<bool> {
    let mut labels = MOVING.get_or_init(Default::default).lock().map_err(error)?;
    if window
        .app_handle()
        .state::<crate::desktop_runtime::Desktop>()
        .transitioning
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        return Err("正在调整记录，暂不能移动窗口。".into());
    }
    let inserted = labels.insert(window.label().into());
    drop(labels);
    if inserted {
        window.emit("window-moving", true).map_err(error)?;
    }
    Ok(inserted)
}
#[cfg(windows)]
fn button_down() -> bool {
    unsafe { windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState(1) < 0 }
}
#[cfg(not(windows))]
fn button_down() -> bool {
    false
}
fn release() {
    let start = Instant::now();
    while button_down() && start.elapsed() < Duration::from_secs(120) {
        std::thread::sleep(Duration::from_millis(16));
    }
}
fn finish(window: &tauri::WebviewWindow) -> Result<()> {
    let result = (|| {
        if window.label() == "desktop-entry" {
            let app = window.app_handle();
            let state = app.state::<crate::desktop_runtime::Desktop>();
            if state.entry.lock().map_err(error)?.busy() {
                return Ok(());
            }
            let p = window.outer_position().map_err(error)?;
            let scale = window.scale_factor().map_err(error)?;
            let monitor = window
                .current_monitor()
                .map_err(error)?
                .ok_or("当前显示器不可用")?;
            let area = monitor.work_area();
            let l = state.layout.lock().map_err(error)?.clone();
            let mut entry = state.entry.lock().map_err(error)?;
            let g = entry.geometry(&l);
            let (left, top, right, bottom) =
                g.slots
                    .iter()
                    .fold((f64::MAX, f64::MAX, 0.0_f64, 0.0_f64), |(x, y, r, b), s| {
                        (
                            x.min(s.x),
                            y.min(s.y),
                            r.max(s.x + s.width),
                            b.max(s.y + s.height),
                        )
                    });
            if !g.slots.is_empty() {
                let (pos, lower) = snap(
                    (p.x, p.y),
                    Rect {
                        x: area.position.x,
                        y: area.position.y,
                        width: area.size.width,
                        height: area.size.height,
                    },
                    scale,
                    (left, top, right - left, bottom - top),
                    true,
                );
                entry.close_lower = lower;
                entry.close_growth = 0.0;
                entry.anchor = Some(pos);
                let compact = EntryState::default().geometry(&l);
                let id = entry
                    .presentation
                    .shelf_id
                    .or(l.visible_ids().first().copied());
                let saved = id
                    .and_then(|id| {
                        g.slots
                            .iter()
                            .find(|s| s.id == id)
                            .zip(compact.slots.iter().find(|s| s.id == id))
                    })
                    .map(|(a, b)| {
                        (
                            pos.0 + ((a.x - b.x) * scale).round() as i32,
                            pos.1 + ((a.y - b.y) * scale).round() as i32,
                        )
                    })
                    .unwrap_or(pos);
                drop(entry);
                {
                    let mut l = state.layout.lock().map_err(error)?;
                    l.preferences.edge = Edge::Free;
                    l.preferences.auto_hide = false;
                    l.entry_position = Some(saved);
                }
                window
                    .set_position(tauri::PhysicalPosition::new(pos.0, pos.1))
                    .map_err(error)?;
                crate::desktop_runtime::entry_geometry(app)?;
                let _ = state.save();
            }
        } else {
            crate::shelf_windows::capture(&window.as_ref().window());
            if let Some(state) = window
                .app_handle()
                .try_state::<crate::desktop_runtime::Desktop>()
            {
                let _ = state.save();
            }
        }
        Ok(())
    })();
    if let Ok(mut set) = MOVING.get_or_init(Default::default).lock() {
        set.remove(window.label());
    }
    let _ = window.emit("window-moving", false);
    result
}
pub async fn drag(window: tauri::WebviewWindow) -> Result<()> {
    crate::desktop_runtime::require_idle(window.app_handle())?;
    if window.label() != "desktop-entry" {
        crate::shelf_windows::scope(&window)?;
    }
    if !begin(&window)? {
        return Err("窗口正在移动。".into());
    }
    if let Err(e) = window.start_dragging() {
        let _ = finish(&window);
        return Err(error(e));
    }
    tauri::async_runtime::spawn_blocking(release)
        .await
        .map_err(error)?;
    finish(&window)
}
pub fn observe_move(window: &tauri::Window) {
    if window.label() == "desktop-entry"
        || moving(window.label())
        || !button_down()
        || crate::desktop_runtime::require_idle(window.app_handle()).is_err()
    {
        return;
    }
    let Some(view) = window.app_handle().get_webview_window(window.label()) else {
        return;
    };
    if crate::shelf_windows::scope(&view).is_err() {
        return;
    }
    if begin(&view) != Ok(true) {
        return;
    }
    std::thread::spawn(move || {
        release();
        let _ = finish(&view);
    });
}
pub fn always_scrollbars() -> bool {
    #[cfg(windows)]
    {
        static VALUE: OnceLock<bool> = OnceLock::new();
        *VALUE.get_or_init(|| {
            windows::UI::ViewManagement::UISettings::new()
                .and_then(|s| s.AutoHideScrollBars())
                .map(|auto| !auto)
                .unwrap_or(true)
        })
    }
    #[cfg(not(windows))]
    {
        false
    }
}
#[derive(Clone, Serialize)]
struct Near {
    shelf_id: Option<i64>,
    x: f64,
    y: f64,
}
pub fn sense(app: &tauri::AppHandle, enabled: bool) {
    use std::sync::atomic::Ordering;
    let state = app.state::<crate::desktop_runtime::Desktop>();
    state.sense_enabled.store(enabled, Ordering::Relaxed);
    if !enabled || state.sense_running.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let mut previous = None;
        loop {
            std::thread::sleep(Duration::from_millis(120));
            let state = app.state::<crate::desktop_runtime::Desktop>();
            if !state.sense_enabled.load(Ordering::Relaxed) {
                state.sense_running.store(false, Ordering::SeqCst);
                if state.sense_enabled.load(Ordering::SeqCst) {
                    sense(&app, true);
                }
                return;
            }
            let Some(window) = app.get_webview_window("desktop-entry") else {
                state.sense_running.store(false, Ordering::SeqCst);
                return;
            };
            if !window.is_visible().unwrap_or(false) || moving(window.label()) {
                continue;
            }
            let l = match state.layout.lock() {
                Ok(l) => l.clone(),
                Err(_) => return,
            };
            let entry = match state.entry.lock() {
                Ok(e) => e.clone(),
                Err(_) => return,
            };
            if entry.busy() || entry.presentation.kind != Kind::Orb {
                continue;
            }
            let Ok(p) = window.cursor_position() else {
                continue;
            };
            let Ok(origin) = window.outer_position() else {
                continue;
            };
            let scale = window.scale_factor().unwrap_or(1.0);
            let (x, y) = (
                (p.x - f64::from(origin.x)) / scale,
                (p.y - f64::from(origin.y)) / scale,
            );
            let target = entry
                .geometry(&l)
                .slots
                .iter()
                .filter_map(|slot| {
                    let distance = ((x - slot.x - slot.width / 2.0).powi(2)
                        + (y - slot.y - slot.height / 2.0).powi(2))
                    .sqrt();
                    (distance < 88.0).then_some((distance, slot.id))
                })
                .min_by(|a, b| a.0.total_cmp(&b.0))
                .map(|(_, id)| id);
            if target.is_some() || previous.is_some() {
                let _ = window.emit(
                    "desktop-near-pointer",
                    Near {
                        shelf_id: target,
                        x,
                        y,
                    },
                );
            }
            previous = target;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capsule_can_snap_at_os_top_limit_at_all_supported_scales() {
        let area = Rect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        };
        for scale in [1.0, 1.25, 1.5] {
            let (p, lower) = snap((300, 0), area, scale, (8.0, 24.0, 184.0, 48.0), true);
            assert!(lower, "capsule native top limit at {scale}");
            assert_eq!(p.1, (-18.0 * scale).round() as i32);
        }
    }
    #[cfg(windows)]
    #[test]
    fn binary_clip_retains_partially_covered_antialias_pixel() {
        use windows::Win32::Graphics::Gdi::{
            CreateRoundRectRgn, DeleteObject, HGDIOBJ, PtInRegion,
        };
        let c = Contour {
            x: 8.0,
            y: 8.0,
            width: 48.0,
            height: 48.0,
            radius: 24.0,
        };
        let [x, y, r, b, rx, ry] = c.raster_bounds(1.0);
        unsafe {
            let region = CreateRoundRectRgn(x, y, r, b, rx, ry);
            let covered = PtInRegion(region, 10, 20).as_bool();
            let _ = DeleteObject(HGDIOBJ(region.0));
            assert!(
                covered,
                "browser edge sample must survive the outer binary mask"
            );
        }
    }
    #[test]
    fn contour_excludes_transparent_corners() {
        let c = Contour {
            x: 8.0,
            y: 8.0,
            width: 48.0,
            height: 48.0,
            radius: 24.0,
        };
        assert!(!c.contains(8.0, 8.0));
        assert!(c.contains(32.0, 8.0));
        assert!(!c.contains(7.0, 32.0));
        assert!(c.contains(32.0, 32.0));
    }
    #[test]
    fn snap_uses_visible_bounds_on_negative_monitor_at_high_dpi() {
        let a = Rect {
            x: -1920,
            y: -1080,
            width: 1920,
            height: 1040,
        };
        let (p, top) = snap((-1920, -1085), a, 1.5, (8.0, 24.0, 184.0, 48.0), true);
        assert_eq!(p, (-1923, -1107));
        assert!(top);
        assert_eq!(p.1 + 36, -1071);
    }
    #[test]
    fn free_position_is_retained_away_from_magnet() {
        let a = Rect {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
        };
        assert_eq!(
            snap((500, 400), a, 1.25, (8.0, 8.0, 48.0, 48.0), true),
            ((500, 400), false)
        );
    }
}
