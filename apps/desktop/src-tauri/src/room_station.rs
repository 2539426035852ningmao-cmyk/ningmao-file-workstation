use crate::{
    Runtime, desktop_runtime::NativeDialogGuard, error, main_only, store::Result,
    transfer_identity, trusted_native_origin,
};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, Metadata, OpenOptions},
    io::{BufRead, BufReader, ErrorKind},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Mutex, mpsc},
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

const PORT: u16 = 5192;
const ADDRESS: &str = "http://127.0.0.1:5192/rooms";
const QUOTAS: [u32; 4] = [512, 2048, 8192, 20480];
const FOLDER_NAME: &str = "柠猫互传暂存";
const MARKER: &str = ".ningmao-room-station";

#[derive(Default)]
pub struct RoomStation(Mutex<Option<Child>>);

#[derive(Serialize, Deserialize)]
struct Settings {
    folder: Option<PathBuf>,
    quota_mib: u32,
}

impl Settings {
    fn load(path: &Path) -> Result<Self> {
        Ok(transfer_identity::read(path)?.unwrap_or(Self {
            folder: None,
            quota_mib: QUOTAS[0],
        }))
    }
}

#[derive(Serialize)]
pub struct StationView {
    available: bool,
    running: bool,
    folder: Option<PathBuf>,
    quota_mib: u32,
    address: Option<&'static str>,
}

struct StationFiles {
    node: PathBuf,
    script: PathBuf,
}

impl StationFiles {
    fn packaged() -> Option<Self> {
        let exe = std::env::current_exe().ok()?;
        let web = exe.parent()?.parent()?.join("web");
        let node = PathBuf::from(std::env::var_os("ProgramFiles")?).join("nodejs/node.exe");
        let script = web.join("selfhost/managed-room.mjs");
        (node.is_file() && script.is_file() && web.join("dist/index.html").is_file())
            .then_some(Self { node, script })
    }
}

fn is_link(metadata: &Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0 // FILE_ATTRIBUTE_REPARSE_POINT
    }
    #[cfg(not(windows))]
    {
        metadata.is_symlink()
    }
}

// Claim an empty, app-specific subfolder. Existing unrelated content stays untouched.
fn claim_folder(parent: &Path) -> Result<PathBuf> {
    let metadata = fs::symlink_metadata(parent).map_err(error)?;
    if !metadata.is_dir() || is_link(&metadata) {
        return Err("请选择普通文件夹作为站点暂存位置。".into());
    }
    let folder = fs::canonicalize(parent).map_err(error)?.join(FOLDER_NAME);
    match fs::create_dir(&folder) {
        Ok(()) => {}
        Err(e) if e.kind() == ErrorKind::AlreadyExists => {}
        Err(e) => return Err(error(e)),
    }
    let metadata = fs::symlink_metadata(&folder).map_err(error)?;
    if !metadata.is_dir() || is_link(&metadata) {
        return Err("暂存子目录与现有文件或链接重名，请选择其他位置。".into());
    }
    let marker = folder.join(MARKER);
    match fs::symlink_metadata(&marker) {
        Ok(metadata) if metadata.is_file() && !is_link(&metadata) => {}
        Err(e) if e.kind() == ErrorKind::NotFound => {
            if fs::read_dir(&folder).map_err(error)?.next().is_some() {
                return Err("暂存子目录里已有其他文件，请选择其他位置。".into());
            }
            OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(marker)
                .map_err(error)?;
        }
        _ => return Err("无法确认目录属于互传站点，请选择其他位置。".into()),
    }
    Ok(folder)
}

fn running(child: &mut Option<Child>) -> Result<bool> {
    if let Some(process) = child {
        if process.try_wait().map_err(error)?.is_none() {
            return Ok(true);
        }
        *child = None;
    }
    Ok(false)
}

fn start_process(files: StationFiles, folder: &Path, quota_mib: u32, port: u16) -> Result<Child> {
    let mut command = Command::new(files.node);
    command
        .arg(files.script)
        .arg(folder)
        .arg((u64::from(quota_mib) * 1024 * 1024).to_string())
        .arg(port.to_string())
        .env_remove("NODE_OPTIONS")
        .env_remove("NODE_PATH")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = command.spawn().map_err(error)?;
    let stdout = child.stdout.take().expect("station stdout was piped");
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut line = String::new();
        if BufReader::new(stdout).read_line(&mut line).is_ok() {
            let _ = sender.send(line);
        }
    });
    match receiver.recv_timeout(Duration::from_secs(8)) {
        Ok(line) if line.trim() == format!("READY {port}") => return Ok(child),
        Ok(line) if line.trim() == "PORT_IN_USE" => {
            terminate(&mut child)?;
            return Err("本机站点的端口已被占用，请先关闭另一个工作站测试窗口。".into());
        }
        _ => terminate(&mut child)?,
    }
    Err("站点启动失败，请检查 Node.js 24、测试包和暂存位置的写入权限。".into())
}

fn terminate(child: &mut Child) -> Result<()> {
    drop(child.stdin.take());
    let deadline = Instant::now() + Duration::from_secs(2);
    while child.try_wait().map_err(error)?.is_none() {
        if Instant::now() >= deadline {
            if let Err(e) = child.kill()
                && child.try_wait().map_err(error)?.is_none()
            {
                return Err(error(e));
            }
            child.wait().map_err(error)?;
            break;
        }
        thread::sleep(Duration::from_millis(25));
    }
    Ok(())
}

impl RoomStation {
    fn view(&self, path: &Path) -> Result<StationView> {
        let is_running = running(&mut *self.0.lock().map_err(error)?)?;
        let settings = Settings::load(path)?;
        Ok(StationView {
            available: is_running || StationFiles::packaged().is_some(),
            running: is_running,
            folder: settings.folder,
            quota_mib: settings.quota_mib,
            address: is_running.then_some(ADDRESS),
        })
    }

    pub fn stop(&self) -> Result<()> {
        let mut child = self.0.lock().map_err(error)?;
        if let Some(process) = child.as_mut() {
            terminate(process)?;
            *child = None;
        }
        Ok(())
    }
}

fn permit(window: &WebviewWindow) -> Result<()> {
    main_only(window)?;
    trusted_native_origin(window)
}

fn settings(state: &Runtime) -> PathBuf {
    state.data_root.join("room-station.bin")
}

#[tauri::command]
pub fn room_station_view(
    window: WebviewWindow,
    state: tauri::State<'_, Runtime>,
) -> Result<StationView> {
    permit(&window)?;
    state.room_station.view(&settings(&state))
}

#[tauri::command]
pub async fn room_station_choose(
    app: tauri::AppHandle,
    window: WebviewWindow,
) -> Result<StationView> {
    permit(&window)?;
    let _dialog = NativeDialogGuard::new(&app);
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let station = &state.room_station;
        let path = settings(&state);
        if let Some(picked) = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("选择暂存位置，将在其中创建「柠猫互传暂存」")
            .blocking_pick_folder()
        {
            let mut child = station.0.lock().map_err(error)?;
            if running(&mut child)? {
                return Err("请先停止本机站点，再更换暂存位置。".into());
            }
            let mut settings = Settings::load(&path)?;
            let parent = picked.into_path().map_err(error)?;
            claim_folder(&parent)?;
            settings.folder = Some(parent.join(FOLDER_NAME));
            transfer_identity::save(&path, &settings)?;
        }
        station.view(&path)
    })
    .await
    .map_err(error)?
}

#[tauri::command]
pub async fn room_station_start(
    app: tauri::AppHandle,
    window: WebviewWindow,
    quota_mib: u32,
) -> Result<StationView> {
    permit(&window)?;
    if !QUOTAS.contains(&quota_mib) {
        return Err("请从列表选择暂存配额。".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        let station = &state.room_station;
        let path = settings(&state);
        {
            let mut child = station.0.lock().map_err(error)?;
            if !running(&mut child)? {
                let files = StationFiles::packaged()
                    .ok_or("请使用互传测试包，并确认已安装 Node.js 24。")?;
                let mut selected = Settings::load(&path)?;
                let parent = selected
                    .folder
                    .as_deref()
                    .and_then(Path::parent)
                    .ok_or("请先选择暂存位置。")?;
                let folder = claim_folder(parent)?;
                selected.quota_mib = quota_mib;
                transfer_identity::save(&path, &selected)?;
                *child = Some(start_process(files, &folder, quota_mib, PORT)?);
            }
        }
        station.view(&path)
    })
    .await
    .map_err(error)?
}

#[tauri::command]
pub async fn room_station_stop(
    app: tauri::AppHandle,
    window: WebviewWindow,
) -> Result<StationView> {
    permit(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Runtime>();
        state.room_station.stop()?;
        state.room_station.view(&settings(&state))
    })
    .await
    .map_err(error)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claims_only_an_empty_subfolder_and_keeps_other_files() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join(FOLDER_NAME);
        let sibling = root.path().join("原件.txt");
        fs::write(&sibling, b"original").unwrap();
        fs::create_dir(&folder).unwrap();
        let unrelated = folder.join("keep.txt");
        fs::write(&unrelated, b"keep").unwrap();
        assert!(claim_folder(root.path()).is_err());
        assert_eq!(fs::read(&unrelated).unwrap(), b"keep");
        fs::remove_file(unrelated).unwrap();
        let claimed = claim_folder(root.path()).unwrap();
        assert!(claimed.join(MARKER).is_file());
        assert_eq!(claim_folder(root.path()).unwrap(), claimed);
        assert_eq!(fs::read(sibling).unwrap(), b"original");
    }
}
