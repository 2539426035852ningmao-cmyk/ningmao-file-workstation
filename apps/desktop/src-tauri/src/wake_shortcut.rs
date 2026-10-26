//! One owned wake shortcut. No input hooks, scanning, file operations or frontend plugin ACL.
use crate::{error, store::Result};
use serde::{Deserialize, Serialize};
use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Manager;

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub version: u32,
    pub enabled: bool,
    pub accelerator: String,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            version: 1,
            enabled: true,
            accelerator: "Ctrl+Alt+Space".into(),
        }
    }
}
impl Config {
    pub fn validate(&self) -> Result<()> {
        let Some((modifiers, key)) = self.accelerator.rsplit_once('+') else {
            return Err("请选择组合键与按键。".into());
        };
        let valid_key = key == "Space"
            || (key.len() == 1 && key.as_bytes()[0].is_ascii_uppercase())
            || key
                .strip_prefix('F')
                .and_then(|v| v.parse::<u8>().ok())
                .is_some_and(|v| (1..=12).contains(&v) && key == format!("F{v}"));
        if self.version != 1
            || !["Ctrl+Alt", "Ctrl+Shift", "Alt+Shift"].contains(&modifiers)
            || !valid_key
        {
            return Err("快捷键设置不受支持，原设置保留。".into());
        }
        Ok(())
    }
}
#[derive(Clone, Serialize)]
pub struct View {
    pub config: Config,
    pub active: bool,
    pub paused: bool,
    pub warning: Option<String>,
}
trait Registry {
    fn register(&mut self, key: &str) -> Result<()>;
    fn unregister(&mut self, key: &str) -> Result<()>;
    fn clear_owned(&mut self) -> Result<()>;
}
fn replace(registry: &mut impl Registry, old: Option<&str>, next: Option<&str>) -> Result<()> {
    if old == next {
        return Ok(());
    }
    if let Some(key) = next {
        registry
            .register(key)
            .map_err(|e| format!("快捷键被占用或无法注册：{e}；原设置保持。"))?;
    }
    if let Some(key) = old
        && let Err(e) = registry.unregister(key)
    {
        let cleanup = next.map(|key| registry.unregister(key)).transpose().err();
        return Err(format!(
            "原快捷键未能释放：{e}。{}",
            cleanup
                .map(|e| format!("新快捷键清理失败：{e}，请完整退出后重试。"))
                .unwrap_or_default()
        ));
    }
    Ok(())
}
struct Controller {
    config: Config,
    registered: Option<String>,
    paused: bool,
    warning: Option<String>,
}
impl Controller {
    fn new(config: Config) -> Self {
        Self {
            config,
            registered: None,
            paused: false,
            warning: None,
        }
    }
    fn view(&self) -> View {
        View {
            config: self.config.clone(),
            active: self.registered.as_deref() == Some(&self.config.accelerator)
                && self.config.enabled
                && !self.paused,
            paused: self.paused,
            warning: self.warning.clone(),
        }
    }
    fn apply(
        &mut self,
        next: Config,
        paused: bool,
        registry: &mut impl Registry,
        persist: impl FnOnce(&Config) -> Result<()>,
    ) -> Result<()> {
        next.validate()?;
        let wanted = (next.enabled && !paused).then(|| next.accelerator.clone());
        let old = self.registered.clone();
        if let Err(e) = replace(registry, old.as_deref(), wanted.as_deref()) {
            self.warning = Some(e.clone());
            return Err(e);
        }
        self.registered = wanted.clone();
        if let Err(e) = persist(&next) {
            let rollback = replace(registry, wanted.as_deref(), old.as_deref());
            let message = match rollback {
                Ok(()) => {
                    self.registered = old;
                    format!("快捷键设置未保存，已恢复原快捷键：{e}")
                }
                Err(rollback) => {
                    let cleanup = registry.clear_owned();
                    self.registered = None;
                    format!(
                        "快捷键设置未保存且回退失败：{e}；{rollback}。{}",
                        cleanup
                            .err()
                            .map(|e| format!("快捷键清理失败：{e}，请完整退出后重试。"))
                            .unwrap_or_else(|| "本次已停用快捷键，仍可通过托盘打开。".into())
                    )
                }
            };
            self.warning = Some(message.clone());
            return Err(message);
        }
        self.config = next;
        self.paused = paused;
        self.warning = None;
        Ok(())
    }
}
struct Settings {
    path: PathBuf,
    writable: bool,
}
impl Settings {
    fn load(root: &Path) -> (Self, Config, Option<String>) {
        let path = root.join("wake-shortcut-v1.json");
        let loaded = (|| -> Result<Config> {
            match std::fs::symlink_metadata(&path) {
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Config::default()),
                Err(_) => return Err("无法读取设置。".into()),
                Ok(m) if !m.is_file() || m.file_type().is_symlink() || m.len() > 16384 => {
                    return Err("设置不是可读取的小型普通文件。".into());
                }
                Ok(_) => {}
            }
            let config: Config =
                serde_json::from_slice(&std::fs::read(&path).map_err(error)?).map_err(error)?;
            config.validate()?;
            Ok(config)
        })();
        match loaded {
            Ok(c) => (
                Self {
                    path,
                    writable: true,
                },
                c,
                None,
            ),
            Err(_) => (
                Self {
                    path,
                    writable: false,
                },
                Config {
                    enabled: false,
                    ..Config::default()
                },
                Some("快捷键设置无法读取或版本不兼容；原文件保留，快捷键未启用。".into()),
            ),
        }
    }
    fn save(&self, config: &Config) -> Result<()> {
        if !self.writable {
            return Err("原快捷键设置被保护，未覆盖不兼容文件。".into());
        }
        config.validate()?;
        let mut file = tempfile::NamedTempFile::new_in(self.path.parent().ok_or("缺少设置目录")?)
            .map_err(error)?;
        file.write_all(&serde_json::to_vec_pretty(config).map_err(error)?)
            .map_err(error)?;
        file.as_file().sync_all().map_err(error)?;
        file.persist(&self.path).map_err(error)?;
        Ok(())
    }
}
struct Inner {
    controller: Controller,
    settings: Settings,
    ready: bool,
}
pub struct Service(Mutex<Inner>);
#[cfg(windows)]
struct Driver(tauri::AppHandle);
#[cfg(windows)]
impl Registry for Driver {
    fn register(&mut self, key: &str) -> Result<()> {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        self.0.global_shortcut().register(key).map_err(error)
    }
    fn unregister(&mut self, key: &str) -> Result<()> {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        self.0.global_shortcut().unregister(key).map_err(error)
    }
    fn clear_owned(&mut self) -> Result<()> {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        self.0.global_shortcut().unregister_all().map_err(error)
    }
}
pub fn setup(app: &tauri::AppHandle, root: &Path) {
    let (settings, config, warning) = Settings::load(root);
    let mut controller = Controller::new(config);
    controller.warning = warning;
    app.manage(Service(Mutex::new(Inner {
        controller,
        settings,
        ready: false,
    })));
    #[cfg(windows)]
    {
        use tauri_plugin_global_shortcut::ShortcutState;
        let plugin = tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
                if event.state != ShortcutState::Pressed {
                    return;
                }
                // Never block the GUI while a worker is waiting for the plugin's main-thread operation.
                let allowed = app
                    .state::<Service>()
                    .0
                    .try_lock()
                    .map(|s| {
                        s.controller
                            .registered
                            .as_deref()
                            .and_then(|key| {
                                key.parse::<tauri_plugin_global_shortcut::Shortcut>().ok()
                            })
                            .is_some_and(|key| key.id() == shortcut.id())
                            && s.controller.view().active
                    })
                    .unwrap_or(false);
                if allowed {
                    let task = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = crate::desktop_runtime::require_idle(&task)
                            .and_then(|_| crate::shelf_windows::show_main(&task))
                        {
                            let _ = tauri::Emitter::emit(&task, "desktop-error", e);
                        }
                    });
                }
            })
            .build();
        if let Err(e) = app.plugin(plugin) {
            if let Ok(mut state) = app.state::<Service>().0.lock() {
                state.controller.warning = Some(format!("全局快捷键不可用，仍可从托盘打开：{e}"));
            }
            return;
        }
        // Setup uses the official plugin; its manager dispatches registration to the GUI thread.
        if let Ok(mut state) = app.state::<Service>().0.lock() {
            state.ready = true;
            let config = state.controller.config.clone();
            if state.settings.writable {
                let _ = state
                    .controller
                    .apply(config, false, &mut Driver(app.clone()), |_| Ok(()));
            }
        }
    }
}
pub fn state(app: &tauri::AppHandle) -> Result<View> {
    Ok(app
        .state::<Service>()
        .0
        .lock()
        .map_err(error)?
        .controller
        .view())
}
pub fn configure(app: &tauri::AppHandle, config: Config, pause: Option<bool>) -> Result<View> {
    #[cfg(windows)]
    {
        let service = app.state::<Service>();
        let mut guard = service.0.lock().map_err(error)?;
        let Inner {
            controller,
            settings,
            ready,
        } = &mut *guard;
        if !*ready {
            return Err("全局快捷键服务不可用，仍可通过托盘打开。".into());
        }
        let config = if pause.is_some() {
            controller.config.clone()
        } else {
            config
        };
        let paused = pause.unwrap_or(controller.paused);
        controller.apply(config, paused, &mut Driver(app.clone()), |config| {
            if pause.is_some() {
                Ok(())
            } else {
                settings.save(config)
            }
        })?;
        Ok(controller.view())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, config, pause);
        Err("当前候选仅在Windows支持全局快捷键。".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    #[derive(Default)]
    struct Fake {
        keys: HashSet<String>,
        fail_register: Option<String>,
        fail_unregister: Option<String>,
    }
    impl Registry for Fake {
        fn register(&mut self, key: &str) -> Result<()> {
            if self.fail_register.as_deref() == Some(key) {
                return Err("occupied".into());
            }
            if !self.keys.insert(key.into()) {
                return Err("duplicate".into());
            }
            Ok(())
        }
        fn unregister(&mut self, key: &str) -> Result<()> {
            if self.fail_unregister.as_deref() == Some(key) {
                return Err("release failed".into());
            }
            self.keys.remove(key);
            Ok(())
        }
        fn clear_owned(&mut self) -> Result<()> {
            self.keys.clear();
            Ok(())
        }
    }
    fn started() -> (Controller, Fake) {
        let mut c = Controller::new(Config::default());
        let mut r = Fake::default();
        c.apply(Config::default(), false, &mut r, |_| Ok(()))
            .unwrap();
        (c, r)
    }
    fn other() -> Config {
        Config {
            accelerator: "Ctrl+Shift+F9".into(),
            ..Config::default()
        }
    }
    #[test]
    fn conflict_keeps_old_binding_and_does_not_persist() {
        let (mut c, mut r) = started();
        r.fail_register = Some(other().accelerator);
        c.apply(other(), false, &mut r, |_| {
            panic!("must not persist conflict")
        })
        .unwrap_err();
        assert!(c.view().active);
        assert_eq!(r.keys, HashSet::from([Config::default().accelerator]));
        assert_eq!(c.config, Config::default());
    }
    #[test]
    fn persistence_failure_restores_old_binding() {
        let (mut c, mut r) = started();
        c.apply(other(), false, &mut r, |_| Err("read only".into()))
            .unwrap_err();
        assert!(c.view().active);
        assert_eq!(c.config, Config::default());
        assert_eq!(r.keys, HashSet::from([Config::default().accelerator]));
    }
    #[test]
    fn failed_release_cleans_new_and_preserves_old() {
        let (mut c, mut r) = started();
        r.fail_unregister = Some(Config::default().accelerator);
        c.apply(other(), false, &mut r, |_| panic!("must not persist"))
            .unwrap_err();
        assert!(c.view().active);
        assert_eq!(r.keys.len(), 1);
    }
    #[test]
    fn pause_and_disable_release_owned_binding() {
        let (mut c, mut r) = started();
        c.apply(c.config.clone(), true, &mut r, |_| Ok(())).unwrap();
        assert!(r.keys.is_empty());
        assert!(c.view().paused);
        assert!(c.config.enabled);
        c.apply(c.config.clone(), false, &mut r, |_| Ok(()))
            .unwrap();
        assert_eq!(r.keys.len(), 1);
        c.apply(
            Config {
                enabled: false,
                ..c.config.clone()
            },
            false,
            &mut r,
            |_| Ok(()),
        )
        .unwrap();
        assert!(r.keys.is_empty());
        assert!(!c.view().active);
    }
    #[test]
    fn invalid_accelerators_never_touch_registry() {
        let (mut c, mut r) = started();
        for key in [
            "A",
            "Ctrl+C",
            "Super+Space",
            "Ctrl+Alt+F01",
            "Ctrl+Alt+Delete",
            "Ctrl+Alt+Space+X",
        ] {
            assert!(
                c.apply(
                    Config {
                        accelerator: key.into(),
                        ..Config::default()
                    },
                    false,
                    &mut r,
                    |_| panic!("invalid config")
                )
                .is_err()
            );
        }
        assert_eq!(r.keys.len(), 1);
    }
    #[test]
    fn rollback_failure_disables_instead_of_reporting_active() {
        let (mut c, mut r) = started();
        r.fail_register = Some(Config::default().accelerator);
        c.apply(other(), false, &mut r, |_| Err("disk denied".into()))
            .unwrap_err();
        assert!(r.keys.is_empty());
        assert!(!c.view().active);
        assert!(c.warning.unwrap().contains("回退失败"));
    }
    #[test]
    fn future_settings_are_preserved_and_default_disabled() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("wake-shortcut-v1.json");
        let original = br#"{"version":9,"enabled":true,"accelerator":"Ctrl+Alt+Space"}"#;
        std::fs::write(&file, original).unwrap();
        let (s, c, w) = Settings::load(dir.path());
        assert!(!c.enabled);
        assert!(w.is_some());
        assert!(s.save(&Config::default()).is_err());
        assert_eq!(std::fs::read(file).unwrap(), original);
    }
    #[cfg(windows)]
    #[test]
    fn accepted_accelerators_match_official_parser_without_os_registration() {
        for modifiers in ["Ctrl+Alt", "Ctrl+Shift", "Alt+Shift"] {
            for key in ["Space", "A", "Z", "F1", "F12"] {
                let text = format!("{modifiers}+{key}");
                let config = Config {
                    accelerator: text.clone(),
                    ..Config::default()
                };
                config.validate().unwrap();
                text.parse::<tauri_plugin_global_shortcut::Shortcut>()
                    .unwrap();
            }
        }
    }
    #[test]
    fn compatible_config_saves_and_reloads() {
        let dir = tempfile::tempdir().unwrap();
        let (s, _, _) = Settings::load(dir.path());
        s.save(&other()).unwrap();
        let (_, c, w) = Settings::load(dir.path());
        assert_eq!(c, other());
        assert!(w.is_none());
    }
}
