//! Desktop layout contains IDs and geometry only; file bytes remain in Store/Copy.
use serde::{Deserialize, Serialize};

pub const PAGE_SIZE: usize = 5;
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct Layout {
    pub version: u32,
    pub enabled: bool,
    pub expanded: bool,
    pub active_shelf: i64,
    pub collapsed: Vec<i64>,
    pub page: usize,
    pub entry_position: Option<(i32, i32)>,
    #[serde(skip)]
    drag_ids: Option<Vec<i64>>,
}
impl Default for Layout {
    fn default() -> Self {
        Self {
            version: 1,
            enabled: false,
            expanded: true,
            active_shelf: 1,
            collapsed: vec![],
            page: 0,
            entry_position: None,
            drag_ids: None,
        }
    }
}
impl Layout {
    pub fn validate(&self) -> bool {
        self.version == 1
            && self.active_shelf > 0
            && self.collapsed.len() <= 256
            && self.collapsed.iter().all(|id| *id > 0)
            && self
                .collapsed
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len()
                == self.collapsed.len()
    }
    pub fn collapse(&mut self, id: i64) {
        self.enabled = true;
        self.expanded = false;
        self.active_shelf = id;
        if !self.collapsed.contains(&id) {
            self.collapsed.push(id);
        }
        self.page = (self.collapsed.len().saturating_sub(1)) / PAGE_SIZE;
    }
    pub fn open(&mut self, id: i64) {
        self.expanded = true;
        self.active_shelf = id;
        self.collapsed.retain(|value| *value != id);
        self.page = self
            .page
            .min(self.collapsed.len().saturating_sub(1) / PAGE_SIZE);
    }
    pub fn visible_ids(&self) -> Vec<i64> {
        let start = self
            .page
            .min(self.collapsed.len().saturating_sub(1) / PAGE_SIZE)
            * PAGE_SIZE;
        self.collapsed
            .iter()
            .skip(start)
            .take(PAGE_SIZE)
            .copied()
            .collect()
    }
    pub fn begin_drag(&mut self) {
        self.drag_ids = Some(self.visible_ids());
    }
    pub fn is_dragging(&self) -> bool {
        self.drag_ids.is_some()
    }
    pub fn hover_target(&self, y: f64, scale: f64) -> Option<i64> {
        if !y.is_finite() || !scale.is_finite() || scale <= 0.0 {
            return None;
        }
        let y = y / scale - 8.0;
        if y < 0.0 {
            return None;
        }
        self.drag_ids
            .as_ref()?
            .get((y / 56.0).floor() as usize)
            .copied()
    }
    pub fn drop_target(&mut self, y: f64, scale: f64) -> Option<i64> {
        let target = self.hover_target(y, scale);
        self.drag_ids = None;
        target
    }
    pub fn cancel_drag(&mut self) {
        self.drag_ids = None;
    }
}
#[derive(Clone, Copy, Debug)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}
pub fn clamp_position(position: (i32, i32), size: (u32, u32), area: Rect) -> (i32, i32) {
    fn axis(value: i32, start: i32, extent: u32, size: u32) -> i32 {
        let start = i64::from(start);
        let end = (start + i64::from(extent) - i64::from(size)).max(start);
        i64::from(value)
            .clamp(start, end)
            .clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32
    }
    (
        axis(position.0, area.x, area.width, size.0),
        axis(position.1, area.y, area.height, size.1),
    )
}
