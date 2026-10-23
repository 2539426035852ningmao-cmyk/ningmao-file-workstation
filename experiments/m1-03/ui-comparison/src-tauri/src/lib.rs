mod fixtures;

use std::{fs::OpenOptions, io::Write, path::PathBuf, sync::Mutex, time::Instant};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

struct Probe {
    root: PathBuf,
    files: Vec<PathBuf>,
    log: Mutex<std::fs::File>,
    started: Instant,
}

#[tauri::command]
fn open_probe_folder(state: tauri::State<'_, Probe>, kind: String) -> Result<(), String> {
    let file = match kind.as_str() {
        "source" => state.root.join("source").join(fixtures::FIXTURES[0].0),
        "target-a" | "target-b" => state.root.join(kind).join("DROP_FILES_HERE.txt"),
        _ => return Err("Unknown probe folder".into()),
    };
    std::process::Command::new("explorer.exe")
        .arg(format!("/select,{}", file.display()))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

impl Probe {
    fn record(&self, kind: &str, detail: &str) -> Result<(), String> {
        let row = serde_json::json!({"ms": self.started.elapsed().as_millis(), "kind":kind, "detail":detail});
        writeln!(self.log.lock().map_err(|e| e.to_string())?, "{row}").map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn fixture_list(state: tauri::State<'_, Probe>) -> Vec<String> {
    state
        .files
        .iter()
        .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
        .collect()
}

#[tauri::command]
fn record_event(
    state: tauri::State<'_, Probe>,
    kind: String,
    detail: String,
) -> Result<(), String> {
    if kind.len() > 64 || detail.len() > 2048 {
        return Err("Event exceeds probe size limit".into());
    }
    state.record(&kind, &detail)
}

#[tauri::command]
fn start_native_drag(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Probe>,
    index: usize,
) -> Result<(), String> {
    // Only known synthetic fixtures can be dragged. No arbitrary file-path IPC.
    let path = state
        .files
        .get(index)
        .ok_or("Unknown fixture index")?
        .clone();
    state.record("native-drag-start", &index.to_string())?;
    let drag_window = window.clone();
    window
        .run_on_main_thread(move || {
            let callback_window = drag_window.clone();
            let result = drag::start_drag(
                &drag_window,
                drag::DragItem::Files(vec![path]),
                drag::Image::Raw(include_bytes!("../icons/32x32.png").to_vec()),
                move |result, _| {
                    let detail = format!("{result:?}");
                    let _ = callback_window
                        .state::<Probe>()
                        .record("native-drag-result", &detail);
                    let _ = callback_window.emit("probe-drag-result", detail);
                },
                drag::Options {
                    mode: drag::DragMode::Copy,
                    skip_animatation_on_cancel_or_failure: true,
                },
            );
            if let Err(error) = result {
                let _ = drag_window
                    .state::<Probe>()
                    .record("native-drag-error", &error.to_string());
                let _ = drag_window.emit("probe-drag-result", error.to_string());
            }
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn show_html_probe(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("html-probe")
        .ok_or("HTML probe missing")?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_topmost(window: tauri::WebviewWindow) -> Result<bool, String> {
    let value = !window.is_always_on_top().map_err(|e| e.to_string())?;
    window.set_always_on_top(value).map_err(|e| e.to_string())?;
    window
        .state::<Probe>()
        .record("always-on-top", &value.to_string())?;
    Ok(value)
}

#[tauri::command]
fn register_probe_shortcut(app: tauri::AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .register("Ctrl+Alt+Shift+F12")
        .map_err(|e| e.to_string())?;
    app.state::<Probe>()
        .record("shortcut-registered", "Ctrl+Alt+Shift+F12")
}

#[tauri::command]
fn probe_info(window: tauri::WebviewWindow) -> Result<serde_json::Value, String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let result = serde_json::json!({
        "window":window.label(),
        "scale_factor":window.scale_factor().map_err(|e| e.to_string())?,
        "monitors": monitors.iter().map(|m| serde_json::json!({"width":m.size().width,"height":m.size().height,"scale":m.scale_factor()})).collect::<Vec<_>>(),
        "topmost":window.is_always_on_top().map_err(|e| e.to_string())?,
    });
    window
        .state::<Probe>()
        .record("probe-info", &result.to_string())?;
    Ok(result)
}

pub fn run() {
    let started = Instant::now();
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = app
                            .state::<Probe>()
                            .record("shortcut-fired", "Ctrl+Alt+Shift+F12");
                        let _ = app.emit("probe-shortcut", true);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            let root = match std::env::var_os("NINGMAO_M103_RUN_ROOT") {
                Some(path) => PathBuf::from(path),
                None => app.path().app_data_dir()?.join("m1-03-synthetic"),
            };
            let files = fixtures::prepare(&root.join("source")).map_err(std::io::Error::other)?;
            for target in ["target-a", "target-b"] {
                let folder = root.join(target);
                std::fs::create_dir_all(&folder)?;
                match OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(folder.join("DROP_FILES_HERE.txt"))
                {
                    Ok(mut file) => file.write_all(
                        b"Drop synthetic probe files into blank space in this folder.\n",
                    )?,
                    Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
                    Err(e) => return Err(e.into()),
                }
            }
            let log = OpenOptions::new()
                .create(true)
                .append(true)
                .open(root.join("events.jsonl"))?;
            app.manage(Probe {
                root,
                files,
                log: Mutex::new(log),
                started,
            });
            app.state::<Probe>()
                .record("startup", "Tauri template + drag 2.1.0 / Copy only")
                .map_err(std::io::Error::other)?;
            let show = tauri::menu::MenuItem::with_id(
                app,
                "show",
                "Show M1-03 probe",
                true,
                None::<&str>,
            )?;
            let quit = tauri::menu::MenuItem::with_id(
                app,
                "quit",
                "Quit M1-03 probe",
                true,
                None::<&str>,
            )?;
            let menu = tauri::menu::Menu::with_items(app, &[&show, &quit])?;
            tauri::tray::TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .ok_or("Missing template icon")?
                        .clone(),
                )
                .tooltip("Ningmao M1-03 technical probe")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => (),
                })
                .build(app)?;
            app.state::<Probe>()
                .record("tray-created", "show / quit")
                .map_err(std::io::Error::other)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fixture_list,
            open_probe_folder,
            record_event,
            start_native_drag,
            show_html_probe,
            toggle_topmost,
            register_probe_shortcut,
            probe_info
        ])
        .run(tauri::generate_context!())
        .expect("M1-03 probe failed");
}
