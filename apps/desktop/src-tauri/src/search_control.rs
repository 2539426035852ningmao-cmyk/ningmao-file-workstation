use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

#[derive(Default)]
pub struct SearchControl(Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>);

pub struct SearchGuard {
    control: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    window: String,
    pub canceled: Arc<AtomicBool>,
}

impl SearchControl {
    pub fn start(&self, window: &str) -> Result<SearchGuard, String> {
        let canceled = Arc::new(AtomicBool::new(false));
        let mut active = self.0.lock().map_err(|_| "搜索状态不可用。".to_string())?;
        if let Some(previous) = active.insert(window.to_owned(), canceled.clone()) {
            previous.store(true, Ordering::Relaxed);
        }
        Ok(SearchGuard {
            control: self.0.clone(),
            window: window.to_owned(),
            canceled,
        })
    }
}

impl Drop for SearchGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = self.control.lock()
            && active
                .get(&self.window)
                .is_some_and(|value| Arc::ptr_eq(value, &self.canceled))
        {
            active.remove(&self.window);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn later_search_cancels_only_its_own_window_and_old_cleanup_keeps_new() {
        let control = SearchControl::default();
        let old = control.start("main").unwrap();
        let other = control.start("manager").unwrap();
        let new = control.start("main").unwrap();
        assert!(old.canceled.load(Ordering::Relaxed));
        assert!(!other.canceled.load(Ordering::Relaxed));
        drop(old);
        let newest = control.start("main").unwrap();
        assert!(new.canceled.load(Ordering::Relaxed));
        assert!(!newest.canceled.load(Ordering::Relaxed));
        assert!(!other.canceled.load(Ordering::Relaxed));
    }
}
