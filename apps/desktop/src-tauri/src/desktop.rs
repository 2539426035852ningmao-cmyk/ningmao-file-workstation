//! Desktop layout contains IDs and geometry only; file bytes remain in Store/Copy.
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub fn detached_id(label: &str) -> Option<i64> {
    let id = label.strip_prefix("shelf-")?.parse::<i64>().ok()?;
    (id > 0 && label == format!("shelf-{id}")).then_some(id)
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WindowGeometry {
    pub x: i32,
    pub y: i32,
    pub width: f64,
    pub height: f64,
}
impl WindowGeometry {
    pub fn validate(&self) -> bool {
        self.width.is_finite()
            && self.height.is_finite()
            && (340.0..=32768.0).contains(&self.width)
            && (320.0..=32768.0).contains(&self.height)
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DetachedShelf {
    pub shelf_id: i64,
    pub visible: bool,
    pub topmost: bool,
    pub geometry: Option<WindowGeometry>,
}
#[derive(Default)]
pub struct WindowDrags {
    pub incoming: HashSet<String>,
    pub outgoing: HashSet<String>,
}
impl WindowDrags {
    pub fn busy(&self) -> bool {
        !self.incoming.is_empty() || !self.outgoing.is_empty()
    }
}

pub const PAGE_SIZE: usize = 5;
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Edge {
    #[default]
    Free,
    Left,
    Right,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct Preferences {
    pub edge: Edge,
    pub auto_hide: bool,
    pub topmost: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            edge: Edge::Free,
            auto_hide: false,
            topmost: true,
        }
    }
}
#[derive(Clone, Copy)]
pub enum Scope {
    Files,
    Metadata,
    Desktop,
    Entry,
}
pub fn permits(label: &str, scope: Scope) -> bool {
    match scope {
        Scope::Files => label == "main",
        Scope::Metadata => matches!(label, "main" | "manager"),
        Scope::Desktop => matches!(label, "main" | "manager" | "desktop-entry"),
        Scope::Entry => label == "desktop-entry",
    }
}
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
    pub preferences: Preferences,
    pub detached: Vec<DetachedShelf>,
    pub main_geometry: Option<WindowGeometry>,
    pub main_topmost: bool,
    #[serde(skip)]
    pub edge_hidden: bool,
    #[serde(skip)]
    drag_ids: Option<Vec<i64>>,
}
impl Default for Layout {
    fn default() -> Self {
        Self {
            version: 3,
            enabled: false,
            expanded: true,
            active_shelf: 1,
            collapsed: vec![],
            page: 0,
            entry_position: None,
            preferences: Preferences::default(),
            detached: vec![],
            main_geometry: None,
            main_topmost: false,
            edge_hidden: false,
            drag_ids: None,
        }
    }
}
impl Layout {
    pub fn validate(&self) -> bool {
        self.version == 3
            && !(self.preferences.edge == Edge::Free && self.preferences.auto_hide)
            && self.active_shelf >= 0
            && self.detached.len() <= 256
            && self
                .detached
                .iter()
                .all(|s| s.shelf_id > 0 && s.geometry.as_ref().is_none_or(WindowGeometry::validate))
            && self
                .detached
                .iter()
                .map(|s| s.shelf_id)
                .collect::<HashSet<_>>()
                .len()
                == self.detached.len()
            && self
                .main_geometry
                .as_ref()
                .is_none_or(WindowGeometry::validate)
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
        self.edge_hidden = false;
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
    pub fn file_scope(&self, label: &str) -> Result<Option<i64>, String> {
        if label == "main" {
            return Ok(None);
        }
        let id = detached_id(label)
            .filter(|id| self.detached.iter().any(|s| s.shelf_id == *id))
            .ok_or("未知或未登记的文件架窗口。")?;
        Ok(Some(id))
    }
    pub fn detach(&mut self, id: i64, catalog: &[i64]) -> Result<(), String> {
        if !catalog.contains(&id) || self.detached.iter().any(|s| s.shelf_id == id) {
            return Err("文件架不存在或已经拆出。".into());
        }
        if self.detached.len() >= 256 {
            return Err("本候选最多登记256个独立架；现有数据不会截断。".into());
        }
        self.detached.push(DetachedShelf {
            shelf_id: id,
            visible: true,
            topmost: false,
            geometry: None,
        });
        self.collapsed.retain(|s| *s != id);
        if self.active_shelf == id {
            self.active_shelf = catalog
                .iter()
                .find(|s| !self.detached.iter().any(|d| d.shelf_id == **s))
                .copied()
                .unwrap_or(0);
        }
        Ok(())
    }
    pub fn merge(&mut self, id: i64) -> Result<(), String> {
        if !self.detached.iter().any(|s| s.shelf_id == id) {
            return Err("文件架并非独立窗口。".into());
        }
        self.detached.retain(|s| s.shelf_id != id);
        self.collapsed.retain(|s| *s != id);
        self.active_shelf = id;
        self.expanded = true;
        Ok(())
    }
    pub fn reconcile(&mut self, catalog: &[i64]) {
        self.detached.retain(|s| catalog.contains(&s.shelf_id));
        self.collapsed.retain(|s| catalog.contains(s));
        if !catalog.contains(&self.active_shelf)
            || self
                .detached
                .iter()
                .any(|s| s.shelf_id == self.active_shelf)
        {
            self.active_shelf = catalog
                .iter()
                .find(|s| !self.detached.iter().any(|d| d.shelf_id == **s))
                .copied()
                .unwrap_or(0);
        }
    }
    pub fn fold_entry(&mut self) -> bool {
        if self.edge_hidden
            || self.is_dragging()
            || self.preferences.edge == Edge::Free
            || !self.preferences.auto_hide
        {
            return false;
        }
        self.edge_hidden = true;
        true
    }
}
#[derive(Clone, Copy, Debug)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}
pub fn contains_point(area: Rect, point: (f64, f64)) -> bool {
    point.0 >= f64::from(area.x)
        && point.0 < f64::from(area.x) + f64::from(area.width)
        && point.1 >= f64::from(area.y)
        && point.1 < f64::from(area.y) + f64::from(area.height)
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
#[derive(Debug)]
pub struct EntryPlacement {
    pub anchor: (i32, i32),
    pub position: (i32, i32),
    pub logical_size: (f64, f64),
}
pub fn entry_placement(
    initial: (i32, i32),
    area: Rect,
    scale: f64,
    count: usize,
    total: usize,
    edge: Edge,
    hidden: bool,
) -> EntryPlacement {
    let height = (count.min(PAGE_SIZE) * 56 + 8 + if total > PAGE_SIZE { 24 } else { 0 }) as f64;
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let width = (64.0 * scale).ceil() as u32;
    let mut anchor = clamp_position(initial, (width, (height * scale).ceil() as u32), area);
    let right = (i64::from(area.x) + i64::from(area.width))
        .clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32;
    if edge == Edge::Left {
        anchor.0 = area.x;
    }
    if edge == Edge::Right {
        anchor.0 = right.saturating_sub(width as i32).max(area.x);
    }
    let folded = hidden && edge != Edge::Free;
    let position = if folded && edge == Edge::Right {
        (
            right
                .saturating_sub((18.0 * scale).ceil() as i32)
                .max(area.x),
            anchor.1,
        )
    } else {
        anchor
    };
    EntryPlacement {
        anchor,
        position,
        logical_size: if folded { (18.0, 64.0) } else { (64.0, height) },
    }
}
