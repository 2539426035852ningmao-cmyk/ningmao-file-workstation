//! Debug-only same-HWND experiment. No file scopes, database or Dock ownership changes.
use crate::{error, store::Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Clone, Copy, Deserialize, Serialize)]
pub struct Frame {
    width: f64,
    height: f64,
    radius: f64,
}
#[derive(Default, Serialize)]
pub struct Probe {
    full: Option<Frame>,
    frames: u64,
    orb_visits: u64,
    capsule_visits: u64,
    full_visits: u64,
    scale: f64,
    hwnd: usize,
}
#[derive(Default)]
pub struct State(Mutex<Probe>);

fn authorize(window: &tauri::WebviewWindow) -> Result<()> {
    if !cfg!(all(debug_assertions, feature = "morph-probe")) || window.label() != "main" {
        return Err("形变探针仅允许专用 debug 构建的 main 窗口。".into());
    }
    if std::env::var_os("NINGMAO_DATA_DIR").is_none() {
        return Err("形变探针必须使用独立数据目录。".into());
    }
    crate::desktop_runtime::require_idle(window.app_handle())?;
    if crate::window_surface::moving(window.label()) {
        return Err("正在移动窗口，形变已暂停。".into());
    }
    Ok(())
}
#[tauri::command]
pub fn morph_probe_begin(
    window: tauri::WebviewWindow,
    state: tauri::State<State>,
) -> Result<Frame> {
    authorize(&window)?;
    let mut probe = state.0.lock().map_err(error)?;
    if let Some(full) = probe.full {
        return Ok(full);
    }
    let scale = window.scale_factor().map_err(error)?;
    let size = window.inner_size().map_err(error)?.to_logical::<f64>(scale);
    let full = Frame {
        width: size.width,
        height: size.height,
        radius: 20.0,
    };
    window
        .set_min_size(Some(tauri::LogicalSize::new(48.0, 48.0)))
        .map_err(error)?;
    // Fixed full viewport is intentional in this experiment; ordinary packages remain resizable.
    window.set_resizable(false).map_err(error)?;
    probe.full = Some(full);
    probe.scale = scale;
    #[cfg(windows)]
    {
        probe.hwnd = window.hwnd().map_err(error)?.0 as usize;
    }
    Ok(full)
}
fn valid(frame: Frame, full: Frame) -> bool {
    frame.width.is_finite()
        && frame.height.is_finite()
        && frame.radius.is_finite()
        && (48.0..=full.width).contains(&frame.width)
        && (48.0..=full.height).contains(&frame.height)
        && (0.0..=36.0).contains(&frame.radius)
}
#[tauri::command]
pub fn morph_probe_frame(
    window: tauri::WebviewWindow,
    state: tauri::State<State>,
    frame: Frame,
) -> Result<Frame> {
    authorize(&window)?;
    let mut probe = state.0.lock().map_err(error)?;
    let full = probe.full.ok_or("请先初始化形变探针。")?;
    if !valid(frame, full) {
        return Err(format!(
            "形变尺寸超出本次探针范围：{} × {}，圆角 {}。",
            frame.width, frame.height, frame.radius
        ));
    }
    window
        .set_size(tauri::LogicalSize::new(frame.width, frame.height))
        .map_err(error)?;
    let scale = window.scale_factor().map_err(error)?;
    #[cfg(windows)]
    {
        use windows::Win32::{
            Foundation::HWND,
            Graphics::Gdi::{CreateRoundRectRgn, DeleteObject, HGDIOBJ, SetWindowRgn},
        };
        let [x, y, r, b, rx, ry] = crate::window_surface::Contour {
            x: 0.0,
            y: 0.0,
            width: frame.width,
            height: frame.height,
            radius: frame.radius,
        }
        .raster_bounds(scale);
        unsafe {
            let region = CreateRoundRectRgn(x, y, r, b, rx, ry);
            if region.0.is_null() {
                return Err("无法创建探针轮廓。".into());
            }
            if SetWindowRgn(
                HWND(window.hwnd().map_err(error)?.0 as _),
                Some(region),
                true,
            ) == 0
            {
                let _ = DeleteObject(HGDIOBJ(region.0));
                return Err("无法设置探针轮廓。".into());
            }
        }
    }
    probe.frames += 1;
    if frame.width == 48.0 && frame.height == 48.0 {
        probe.orb_visits += 1;
    }
    if frame.width == 288.0 && frame.height == 72.0 {
        probe.capsule_visits += 1;
    }
    if frame.width == full.width && frame.height == full.height {
        probe.full_visits += 1;
    }
    let actual = window.inner_size().map_err(error)?.to_logical::<f64>(scale);
    Ok(Frame {
        width: actual.width,
        height: actual.height,
        // Match CSS radius normalization after physical-pixel rounding. Radius
        // and height arrive as separately decoded floats, not exact halves.
        radius: frame
            .radius
            .min(actual.width / 2.0)
            .min(actual.height / 2.0),
    })
}
#[tauri::command]
pub fn morph_probe_report(window: tauri::WebviewWindow, state: tauri::State<State>) -> Result<()> {
    authorize(&window)?;
    let probe = state.0.lock().map_err(error)?;
    let root = &window.app_handle().state::<crate::Runtime>().data_root;
    std::fs::write(
        root.join("morph-probe.json"),
        serde_json::to_vec_pretty(&*probe).map_err(error)?,
    )
    .map_err(error)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn geometry_boundary_accepts_modes_rejects_nonfinite_and_oversize() {
        let full = Frame {
            width: 420.0,
            height: 520.0,
            radius: 20.0,
        };
        assert!(valid(full, full));
        assert!(valid(
            Frame {
                width: 48.0,
                height: 48.0,
                radius: 24.0
            },
            full
        ));
        assert!(valid(
            Frame {
                width: 48.0,
                height: 48.0,
                radius: 24.000000000000004
            },
            full
        ));
        assert!(valid(
            Frame {
                width: 288.0,
                height: 72.0,
                radius: 36.0
            },
            full
        ));
        assert!(!valid(
            Frame {
                width: f64::NAN,
                ..full
            },
            full
        ));
        assert!(!valid(
            Frame {
                width: 421.0,
                ..full
            },
            full
        ));
        assert!(!valid(
            Frame {
                radius: 300.0,
                ..full
            },
            full
        ));
    }
}
