use crate::store::Result;
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};

#[derive(Default)]
struct WindowState {
    generation: u64,
    closing: bool,
}
#[derive(Default)]
struct State {
    active: Option<Entry>,
    windows: HashMap<String, WindowState>,
}
#[derive(Default)]
pub struct ScanControl {
    state: Arc<Mutex<State>>,
    next: AtomicU64,
}
struct Entry {
    owner: String,
    id: u64,
    canceled: Arc<AtomicBool>,
    running: bool,
}
pub struct ScanGuard {
    state: Arc<Mutex<State>>,
    id: u64,
    pub canceled: Arc<AtomicBool>,
}
impl ScanControl {
    pub fn generation(&self, owner: &str) -> Result<u64> {
        let mut state = self.state.lock().map_err(|_| "比较状态不可用。")?;
        let window = state.windows.entry(owner.into()).or_default();
        if window.closing {
            return Err("窗口正在关闭，比较未开始。".into());
        }
        Ok(window.generation)
    }
    pub fn begin(&self, owner: &str, generation: u64, visible: bool) -> Result<u64> {
        let mut state = self.state.lock().map_err(|_| "比较状态不可用。")?;
        let window = state.windows.entry(owner.into()).or_default();
        if !visible || window.closing || window.generation != generation {
            return Err("窗口已关闭或变化，比较未开始。".into());
        }
        if state.active.is_some() {
            return Err("已有重复分析正在进行，请稍后重试。".into());
        }
        let id = self
            .next
            .fetch_add(1, Ordering::Relaxed)
            .checked_add(1)
            .ok_or("比较编号耗尽。")?;
        state.active = Some(Entry {
            owner: owner.into(),
            id,
            canceled: Arc::new(AtomicBool::new(false)),
            running: false,
        });
        Ok(id)
    }
    pub fn claim(&self, owner: &str, id: u64) -> Result<ScanGuard> {
        let mut state = self.state.lock().map_err(|_| "比较状态不可用。")?;
        let entry = state
            .active
            .as_mut()
            .filter(|e| e.owner == owner && e.id == id && !e.running)
            .ok_or("比较已取消或失效。")?;
        entry.running = true;
        Ok(ScanGuard {
            state: Arc::clone(&self.state),
            id,
            canceled: Arc::clone(&entry.canceled),
        })
    }
    fn cancel_locked(state: &mut State, owner: &str, id: Option<u64>) {
        if let Some(entry) = state
            .active
            .as_mut()
            .filter(|e| e.owner == owner && id.is_none_or(|id| id == e.id))
        {
            entry.canceled.store(true, Ordering::Release);
            if !entry.running {
                state.active = None;
            }
        }
    }
    pub fn cancel(&self, owner: &str, id: Option<u64>) -> Result<()> {
        let mut state = self.state.lock().map_err(|_| "比较状态不可用。")?;
        Self::cancel_locked(&mut state, owner, id);
        Ok(())
    }
    pub fn close_start(&self, owner: &str) -> Result<u64> {
        let mut state = self.state.lock().map_err(|_| "比较状态不可用。")?;
        let window = state.windows.entry(owner.into()).or_default();
        window.generation = window
            .generation
            .checked_add(1)
            .ok_or("窗口状态编号耗尽。")?;
        window.closing = true;
        let generation = window.generation;
        Self::cancel_locked(&mut state, owner, None);
        Ok(generation)
    }
    pub fn close_finish(&self, owner: &str, generation: u64) -> Result<()> {
        let mut state = self.state.lock().map_err(|_| "比较状态不可用。")?;
        if let Some(window) = state.windows.get_mut(owner)
            && window.generation == generation
        {
            window.closing = false;
        }
        Ok(())
    }
}
impl Drop for ScanGuard {
    fn drop(&mut self) {
        if let Ok(mut state) = self.state.lock()
            && state.active.as_ref().is_some_and(|e| e.id == self.id)
        {
            state.active = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn begin(c: &ScanControl, owner: &str) -> Result<u64> {
        let g = c.generation(owner)?;
        c.begin(owner, g, true)
    }
    #[test]
    fn canceled_reservation_never_starts() {
        let c = ScanControl::default();
        let id = begin(&c, "main").unwrap();
        c.cancel("main", Some(id)).unwrap();
        assert!(c.claim("main", id).is_err());
        assert!(begin(&c, "main").is_ok());
    }
    #[test]
    fn active_cancel_is_scoped_and_releases_only_on_drop() {
        let c = ScanControl::default();
        let id = begin(&c, "main").unwrap();
        let g = c.claim("main", id).unwrap();
        c.cancel("other", Some(id)).unwrap();
        assert!(!g.canceled.load(Ordering::Acquire));
        c.cancel("main", Some(id)).unwrap();
        assert!(g.canceled.load(Ordering::Acquire));
        assert!(begin(&c, "other").is_err());
        drop(g);
        assert!(begin(&c, "other").is_ok());
    }
    #[test]
    fn old_ticket_cannot_cancel_new_scan() {
        let c = ScanControl::default();
        let a = begin(&c, "main").unwrap();
        c.cancel("main", Some(a)).unwrap();
        let b = begin(&c, "main").unwrap();
        c.cancel("main", Some(a)).unwrap();
        assert!(c.claim("main", b).is_ok());
    }
    #[test]
    fn close_invalidates_inflight_visibility_check_and_reopen_survives() {
        let c = ScanControl::default();
        let old = c.generation("main").unwrap();
        let closing = c.close_start("main").unwrap();
        assert!(c.begin("main", old, true).is_err());
        assert!(c.generation("main").is_err());
        c.close_finish("main", closing).unwrap();
        let now = c.generation("main").unwrap();
        assert!(c.begin("main", now, false).is_err());
        let id = c.begin("main", now, true).unwrap();
        assert!(c.claim("main", id).is_ok());
    }
}
