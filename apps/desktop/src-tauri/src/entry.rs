//! Original entry presentation. Rectangles, not animated SVG pixels, own native drops.
use crate::desktop::{Edge, Layout, Rect, clamp_position};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Kind {
    #[default]
    Orb,
    Capsule,
    QuickPeek,
}
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Flow {
    #[default]
    Vertical,
    Horizontal,
}
#[derive(Clone, Default, Serialize)]
pub struct Presentation {
    pub kind: Kind,
    pub shelf_id: Option<i64>,
}
#[derive(Clone, Serialize)]
pub struct Slot {
    pub id: i64,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
impl Slot {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x < self.x + self.width && y >= self.y && y < self.y + self.height
    }
}
#[derive(Clone, Serialize)]
pub struct Geometry {
    pub width: f64,
    pub height: f64,
    pub slots: Vec<Slot>,
}
#[derive(Clone)]
struct Drag {
    geometry: Geometry,
    target: Option<i64>,
}
#[derive(Clone, Default)]
pub struct EntryState {
    pub presentation: Presentation,
    pub anchor: Option<(i32, i32)>,
    drag: Option<Drag>,
}
impl EntryState {
    pub fn busy(&self) -> bool {
        self.drag.is_some()
    }
    pub fn target(&self) -> Option<i64> {
        self.drag.as_ref().and_then(|d| d.target)
    }
    pub fn reset(&mut self) {
        if !self.busy() {
            self.presentation = Presentation::default();
            self.anchor = None;
        }
    }
    pub fn present(&mut self, layout: &Layout, id: i64, kind: Kind) -> Result<(), String> {
        if self.busy() {
            return Err("正在原生投放，请先完成或取消；入口形态保持固定。".into());
        }
        if !layout.visible_ids().contains(&id) {
            return Err("该入口已变化，请重新选择文件架。".into());
        }
        self.presentation = Presentation {
            kind,
            shelf_id: if kind == Kind::Orb { None } else { Some(id) },
        };
        if kind == Kind::Orb {
            self.anchor = None;
        }
        Ok(())
    }
    pub fn geometry(&self, layout: &Layout) -> Geometry {
        if let Some(drag) = &self.drag {
            return drag.geometry.clone();
        }
        let visible = layout.visible_ids();
        // Focus one expanded surface; do not capture a large transparent rectangle
        // around the other small nodes. Returning to orb restores their saved order.
        let ids = if self.presentation.kind != Kind::Orb
            && self
                .presentation
                .shelf_id
                .is_some_and(|id| visible.contains(&id))
        {
            vec![self.presentation.shelf_id.unwrap()]
        } else {
            visible
        };
        let horizontal = matches!(layout.preferences.edge, Edge::Top | Edge::Bottom)
            || matches!(layout.preferences.edge, Edge::Free)
                && matches!(layout.preferences.flow, Flow::Horizontal);
        if layout.edge_hidden {
            let (width, height) = if horizontal {
                (64.0, 18.0)
            } else {
                (18.0, 64.0)
            };
            return Geometry {
                width,
                height,
                slots: ids
                    .first()
                    .map(|id| Slot {
                        id: *id,
                        x: 0.0,
                        y: 0.0,
                        width,
                        height,
                    })
                    .into_iter()
                    .collect(),
            };
        }
        let (mut x, mut y, mut width, mut height) = (8.0, 8.0, 64.0_f64, 64.0_f64);
        let slots = ids
            .into_iter()
            .map(|id| {
                let kind = if self.presentation.shelf_id == Some(id) {
                    self.presentation.kind
                } else {
                    Kind::Orb
                };
                let (w, h) = match kind {
                    Kind::Orb => (48.0, 48.0),
                    Kind::Capsule => (184.0, 48.0),
                    Kind::QuickPeek => (300.0, 224.0),
                };
                let slot = Slot {
                    id,
                    x,
                    y,
                    width: w,
                    height: h,
                };
                width = width.max(x + w + 8.0);
                height = height.max(y + h + 8.0);
                if horizontal {
                    x += w + 8.0;
                } else {
                    y += h + 8.0;
                }
                slot
            })
            .collect();
        Geometry {
            width,
            height: height
                + if layout.collapsed.len() > 5 {
                    24.0
                } else {
                    0.0
                },
            slots,
        }
    }
    pub fn begin_drag(&mut self, layout: &Layout, x: f64, y: f64, scale: f64) -> Option<i64> {
        if self.drag.is_none() {
            self.drag = Some(Drag {
                geometry: self.geometry(layout),
                target: None,
            });
        }
        self.over(x, y, scale)
    }
    pub fn over(&mut self, x: f64, y: f64, scale: f64) -> Option<i64> {
        let drag = self.drag.as_mut()?;
        if drag.target.is_none() && valid_point(x, y, scale) {
            drag.target = drag
                .geometry
                .slots
                .iter()
                .find(|slot| slot.contains(x / scale, y / scale))
                .map(|s| s.id);
        }
        drag.target
    }
    pub fn drop_target(&mut self, x: f64, y: f64, scale: f64) -> Option<i64> {
        let drag = self.drag.take()?;
        if !valid_point(x, y, scale) {
            return None;
        }
        let target = drag.target?;
        drag.geometry
            .slots
            .iter()
            .find(|slot| slot.id == target && slot.contains(x / scale, y / scale))
            .map(|s| s.id)
    }
    pub fn cancel_drag(&mut self) {
        self.drag = None;
    }
}
fn valid_point(x: f64, y: f64, scale: f64) -> bool {
    x.is_finite() && y.is_finite() && scale.is_finite() && scale > 0.0
}
pub fn place(
    initial: (i32, i32),
    area: Rect,
    scale: f64,
    size: (f64, f64),
    edge: Edge,
) -> (i32, i32) {
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let dimensions = (
        (size.0 * scale).ceil() as u32,
        (size.1 * scale).ceil() as u32,
    );
    let mut p = clamp_position(initial, dimensions, area);
    if edge == Edge::Left {
        p.0 = area.x;
    }
    if edge == Edge::Right {
        p.0 = (i64::from(area.x) + i64::from(area.width) - i64::from(dimensions.0))
            .clamp(i64::from(area.x), i64::from(i32::MAX)) as i32;
    }
    if edge == Edge::Top {
        p.1 = area.y;
    }
    if edge == Edge::Bottom {
        p.1 = (i64::from(area.y) + i64::from(area.height) - i64::from(dimensions.1))
            .clamp(i64::from(area.y), i64::from(i32::MAX)) as i32;
    }
    p
}
