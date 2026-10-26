#![cfg(windows)]
use ningmao_desktop_lib::window_surface::Contour;
use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, DeleteObject, HGDIOBJ, PtInRegion};
#[test]
fn floating_surface_mask_preserves_visible_antialias_coverage_at_each_dpi() {
    for scale in [1.0, 1.25, 1.5] {
        for (width, height, radius) in [
            (48.0, 48.0, 24.0),
            (184.0, 48.0, 24.0),
            (300.0, 224.0, 20.0),
        ] {
            let c = Contour {
                x: 8.0,
                y: 8.0,
                width,
                height,
                radius,
            };
            let [l, t, r, b, rx, ry] = c.raster_bounds(scale);
            let region = unsafe { CreateRoundRectRgn(l, t, r, b, rx, ry) };
            let left = c.x * scale;
            let top = c.y * scale;
            let right = (c.x + width) * scale;
            let bottom = (c.y + height) * scale;
            let radius = radius * scale;
            let mut missing = None;
            for y in top.floor() as i32..bottom.ceil() as i32 {
                for x in left.floor() as i32..right.ceil() as i32 {
                    let dx = (left + radius - f64::from(x + 1))
                        .max(f64::from(x) - (right - radius))
                        .max(0.0);
                    let dy = (top + radius - f64::from(y + 1))
                        .max(f64::from(y) - (bottom - radius))
                        .max(0.0);
                    if dx * dx + dy * dy < radius * radius
                        && !unsafe { PtInRegion(region, x, y) }.as_bool()
                    {
                        missing = Some((x, y));
                        break;
                    }
                }
                if missing.is_some() {
                    break;
                }
            }
            if missing.is_some() {
                let mut rect = windows::Win32::Foundation::RECT::default();
                let result = unsafe { windows::Win32::Graphics::Gdi::GetRgnBox(region, &mut rect) };
                eprintln!(
                    "box={rect:?} result={result:?} points={:?}",
                    [
                        unsafe { PtInRegion(region, 32, 32) }.as_bool(),
                        unsafe { PtInRegion(region, 53, 43) }.as_bool()
                    ]
                );
            }
            unsafe {
                let _ = DeleteObject(HGDIOBJ(region.0));
            }
            assert!(
                missing.is_none(),
                "visible edge clipped: size={width}x{height} dpi={scale} pixel={missing:?}"
            );
        }
    }
}
