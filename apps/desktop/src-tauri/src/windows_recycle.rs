//! Windows recycle only. No permanent-delete fallback and no automatic elevation.
use crate::store::Result;
use serde::Serialize;
use std::path::{Path, PathBuf};
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Identity {
    pub volume: u32,
    pub index: u64,
    pub bytes: u64,
    pub modified: u64,
}
#[derive(Clone)]
pub struct Target {
    pub path: PathBuf,
    pub identity: Identity,
}
#[cfg(windows)]
mod native {
    use super::*;
    use crate::store::canonical_user_path;
    use std::{
        fs::{File, OpenOptions},
        os::windows::{fs::OpenOptionsExt, io::AsRawHandle},
        sync::{Arc, Mutex},
    };
    use windows::{
        Win32::{
            Foundation::{E_ABORT, HANDLE},
            Storage::FileSystem::{
                BY_HANDLE_FILE_INFORMATION, GetDriveTypeW, GetFileInformationByHandle,
                GetVolumeInformationW,
            },
            System::Com::{
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
                CoUninitialize,
            },
            UI::Shell::*,
        },
        core::{HRESULT, HSTRING, PCWSTR, Ref, implement},
    };
    fn err(e: impl std::fmt::Display) -> String {
        e.to_string()
    }
    fn file(path: &Path) -> Result<File> {
        OpenOptions::new()
            .read(true)
            .share_mode(1 | 4)
            .custom_flags(0x00200000)
            .open(path)
            .map_err(err)
    }
    fn identity(f: &File) -> Result<Identity> {
        unsafe {
            let mut i = BY_HANDLE_FILE_INFORMATION::default();
            GetFileInformationByHandle(HANDLE(f.as_raw_handle()), &mut i).map_err(err)?;
            if i.dwFileAttributes & 0x410 != 0 {
                return Err("仅支持普通文件，不操作目录或重解析点。".into());
            }
            Ok(Identity {
                volume: i.dwVolumeSerialNumber,
                index: (u64::from(i.nFileIndexHigh) << 32) | u64::from(i.nFileIndexLow),
                bytes: (u64::from(i.nFileSizeHigh) << 32) | u64::from(i.nFileSizeLow),
                modified: (u64::from(i.ftLastWriteTime.dwHighDateTime) << 32)
                    | u64::from(i.ftLastWriteTime.dwLowDateTime),
            })
        }
    }
    fn blocked(path: &Path, protected: &Path) -> Result<()> {
        let text = path.to_string_lossy();
        let plain = text.strip_prefix(r"\\?\").unwrap_or(&text);
        if plain.starts_with(r"\\") || plain.as_bytes().get(1) != Some(&b':') {
            return Err("Windows 回收仅支持本机固定磁盘。".into());
        }
        let root = HSTRING::from(format!("{}\\", &plain[..2]));
        if unsafe { GetDriveTypeW(PCWSTR(root.as_ptr())) } != 3 {
            return Err("此卷不是已支持的固定磁盘，未删除文件。".into());
        }
        let mut filesystem = [0u16; 32];
        unsafe {
            GetVolumeInformationW(
                PCWSTR(root.as_ptr()),
                None,
                None,
                None,
                None,
                Some(&mut filesystem),
            )
            .map_err(err)?;
        }
        let end = filesystem
            .iter()
            .position(|c| *c == 0)
            .unwrap_or(filesystem.len());
        if String::from_utf16_lossy(&filesystem[..end]) != "NTFS" {
            return Err("当前系统回收仅验证 NTFS 固定磁盘；此卷未被操作。".into());
        }
        let mut excluded = vec![protected.to_path_buf()];
        for key in [
            "APPDATA",
            "LOCALAPPDATA",
            "ProgramData",
            "SystemRoot",
            "ProgramFiles",
            "ProgramFiles(x86)",
        ] {
            if let Some(p) = std::env::var_os(key) {
                excluded.push(PathBuf::from(p));
            }
        }
        if let Some(home) = std::env::var_os("USERPROFILE") {
            for part in [".codex", ".ssh", ".aws", ".config"] {
                excluded.push(PathBuf::from(&home).join(part));
            }
        }
        if let Ok(exe) = std::env::current_exe()
            && let Some(parent) = exe.parent()
        {
            excluded.push(parent.into());
        }
        for root in excluded {
            if let Ok(root) = std::fs::canonicalize(root) {
                let res = {
                    let p = path.to_string_lossy().to_lowercase();
                    let r = root.to_string_lossy().to_lowercase();
                    p == r || p.starts_with(&(r + "\\"))
                };
                if res {
                    return Err("该路径属于应用数据、程序或受保护配置，禁止回收。".into());
                }
            }
        }
        if path.parent().is_none_or(|p| p.parent().is_none()) {
            return Err("不操作磁盘根目录下的对象。".into());
        }
        Ok(())
    }
    pub fn inspect(path: &Path, protected: &Path) -> Result<Target> {
        // Reject reparse points in every lexical ancestor before canonicalization.
        for ancestor in path.ancestors() {
            let meta = std::fs::symlink_metadata(ancestor).map_err(err)?;
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 {
                return Err("路径包含重解析点，未操作文件。".into());
            }
        }
        let path = canonical_user_path(path)?;
        blocked(&path, protected)?;
        let id = identity(&file(&path)?)?;
        Ok(Target { path, identity: id })
    }
    struct Com;
    impl Drop for Com {
        fn drop(&mut self) {
            unsafe { CoUninitialize() }
        }
    }
    #[derive(Default)]
    struct Outcome {
        new_path: Option<PathBuf>,
        failure: Option<String>,
    }
    #[implement(IFileOperationProgressSink)]
    struct Sink {
        target: Target,
        outcome: Arc<Mutex<Outcome>>,
        cancel: Arc<std::sync::atomic::AtomicBool>,
    }
    #[allow(non_snake_case)]
    impl IFileOperationProgressSink_Impl for Sink_Impl {
        fn StartOperations(&self) -> windows_core::Result<()> {
            Ok(())
        }
        fn FinishOperations(&self, _hrresult: windows_core::HRESULT) -> windows_core::Result<()> {
            Ok(())
        }
        fn PreRenameItem(
            &self,
            _dwflags: u32,
            _psiitem: windows_core::Ref<IShellItem>,
            _psznewname: &windows_core::PCWSTR,
        ) -> windows_core::Result<()> {
            Ok(())
        }
        fn PostRenameItem(
            &self,
            _dwflags: u32,
            _psiitem: windows_core::Ref<IShellItem>,
            _psznewname: &windows_core::PCWSTR,
            _hrrename: windows_core::HRESULT,
            _psinewlycreated: windows_core::Ref<IShellItem>,
        ) -> windows_core::Result<()> {
            Ok(())
        }
        fn PreMoveItem(
            &self,
            _dwflags: u32,
            _psiitem: windows_core::Ref<IShellItem>,
            _psidestinationfolder: windows_core::Ref<IShellItem>,
            _psznewname: &windows_core::PCWSTR,
        ) -> windows_core::Result<()> {
            Ok(())
        }
        fn PostMoveItem(
            &self,
            _dwflags: u32,
            _psiitem: windows_core::Ref<IShellItem>,
            _psidestinationfolder: windows_core::Ref<IShellItem>,
            _psznewname: &windows_core::PCWSTR,
            _hrmove: windows_core::HRESULT,
            _psinewlycreated: windows_core::Ref<IShellItem>,
        ) -> windows_core::Result<()> {
            Ok(())
        }
        fn PreCopyItem(
            &self,
            _dwflags: u32,
            _psiitem: windows_core::Ref<IShellItem>,
            _psidestinationfolder: windows_core::Ref<IShellItem>,
            _psznewname: &windows_core::PCWSTR,
        ) -> windows_core::Result<()> {
            Ok(())
        }
        fn PostCopyItem(
            &self,
            _dwflags: u32,
            _psiitem: windows_core::Ref<IShellItem>,
            _psidestinationfolder: windows_core::Ref<IShellItem>,
            _psznewname: &windows_core::PCWSTR,
            _hrcopy: windows_core::HRESULT,
            _psinewlycreated: windows_core::Ref<IShellItem>,
        ) -> windows_core::Result<()> {
            Ok(())
        }
        fn PreNewItem(
            &self,
            _dwflags: u32,
            _psidestinationfolder: windows_core::Ref<IShellItem>,
            _psznewname: &windows_core::PCWSTR,
        ) -> windows_core::Result<()> {
            Ok(())
        }
        fn PostNewItem(
            &self,
            _dwflags: u32,
            _psidestinationfolder: windows_core::Ref<IShellItem>,
            _psznewname: &windows_core::PCWSTR,
            _psztemplatename: &windows_core::PCWSTR,
            _dwfileattributes: u32,
            _hrnew: windows_core::HRESULT,
            _psinewitem: windows_core::Ref<IShellItem>,
        ) -> windows_core::Result<()> {
            Ok(())
        }
        fn UpdateProgress(&self, _iworktotal: u32, _iworksofar: u32) -> windows_core::Result<()> {
            if self.cancel.load(std::sync::atomic::Ordering::SeqCst) {
                return Err(E_ABORT.into());
            }
            Ok(())
        }
        fn ResetTimer(&self) -> windows_core::Result<()> {
            Ok(())
        }
        fn PauseTimer(&self) -> windows_core::Result<()> {
            Ok(())
        }
        fn ResumeTimer(&self) -> windows_core::Result<()> {
            Ok(())
        }
        fn PreDeleteItem(
            &self,
            _dwflags: u32,
            _psiitem: Ref<IShellItem>,
        ) -> windows::core::Result<()> {
            if self.cancel.load(std::sync::atomic::Ordering::SeqCst) {
                return Err(E_ABORT.into());
            }
            let current = file(&self.target.path).and_then(|f| identity(&f));
            if current.as_ref() != Ok(&self.target.identity) {
                return Err(E_ABORT.into());
            }
            Ok(())
        }
        fn PostDeleteItem(
            &self,
            _dwflags: u32,
            _psiitem: Ref<IShellItem>,
            hrdelete: HRESULT,
            psinewlycreated: Ref<IShellItem>,
        ) -> windows::core::Result<()> {
            let result = (|| -> Result<PathBuf> {
                hrdelete.ok().map_err(err)?;
                let item = psinewlycreated
                    .as_ref()
                    .ok_or("Windows 未返回回收站实体，不能确认回收成功。")?;
                let path = unsafe { item.GetDisplayName(SIGDN_FILESYSPATH) }.map_err(err)?;
                let text = unsafe { path.to_string() }.map_err(err);
                unsafe { windows::Win32::System::Com::CoTaskMemFree(Some(path.0 as _)) };
                let path = PathBuf::from(text?);
                let id = identity(&file(&path)?)?;
                if id != self.target.identity {
                    return Err("回收站实体身份不符，请保留日志并人工核对。".into());
                }
                if !path
                    .to_string_lossy()
                    .to_ascii_lowercase()
                    .contains("$recycle.bin")
                {
                    return Err("Windows 返回的目标不是回收站，未确认成功。".into());
                }
                Ok(path)
            })();
            if let Ok(mut value) = self.outcome.lock() {
                match result {
                    Ok(p) => value.new_path = Some(p),
                    Err(e) => value.failure = Some(e),
                }
            }
            Ok(())
        }
    }
    pub fn execute(target: &Target, protected: &Path) -> Result<PathBuf> {
        execute_with_cancel(
            target,
            protected,
            Arc::new(std::sync::atomic::AtomicBool::new(false)),
        )
    }
    pub fn execute_with_cancel(
        target: &Target,
        protected: &Path,
        cancel: Arc<std::sync::atomic::AtomicBool>,
    ) -> Result<PathBuf> {
        if cancel.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("已取消，文件保留。".into());
        }
        let current = inspect(&target.path, protected)?;
        if current.identity != target.identity {
            return Err("文件已变化；没有回收。".into());
        }
        // Hold every parent against rename/reparse replacement during the Shell operation.
        let mut parents = Vec::new();
        for parent in target.path.ancestors().skip(1) {
            let mut options = OpenOptions::new();
            options
                .read(true)
                .share_mode(1 | 2)
                .custom_flags(0x02000000 | 0x00200000);
            parents.push(options.open(parent).map_err(err)?);
        }
        let held = file(&target.path)?;
        if identity(&held)? != target.identity {
            return Err("文件身份已变化。".into());
        }
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                .ok()
                .map_err(err)?;
        }
        let _com = Com;
        let outcome = Arc::new(Mutex::new(Outcome::default()));
        let sink: IFileOperationProgressSink = Sink {
            target: target.clone(),
            outcome: outcome.clone(),
            cancel,
        }
        .into();
        unsafe {
            let op: IFileOperation =
                CoCreateInstance(&FileOperation, None, CLSCTX_INPROC_SERVER).map_err(err)?;
            op.SetOperationFlags(
                FOFX_RECYCLEONDELETE
                    | FOFX_EARLYFAILURE
                    | FOFX_ADDUNDORECORD
                    | FOF_NOERRORUI
                    | FOF_SILENT
                    | FOF_NOCONFIRMATION,
            )
            .map_err(err)?;
            let text = target.path.to_string_lossy();
            let path = HSTRING::from(text.strip_prefix(r"\\?\").unwrap_or(&text));
            let item: IShellItem = SHCreateItemFromParsingName(PCWSTR(path.as_ptr()), None)
                .map_err(|e| format!("Shell parse: {e}"))?;
            op.DeleteItem(&item, &sink).map_err(err)?;
            op.PerformOperations()
                .map_err(|e| format!("Shell perform: {e}"))?;
            if op.GetAnyOperationsAborted().map_err(err)?.as_bool() {
                return Err("系统回收已取消或未完成；不会转为永久删除。".into());
            }
        }
        let mut result = outcome.lock().map_err(err)?;
        if let Some(e) = result.failure.take() {
            return Err(e);
        }
        result
            .new_path
            .take()
            .ok_or("Windows 没有确认逐项回收结果；请检查系统回收站。".into())
    }
}
#[cfg(windows)]
pub use native::{execute, execute_with_cancel, inspect};
#[cfg(not(windows))]
pub fn inspect(_: &Path, _: &Path) -> Result<Target> {
    Err("Windows 系统回收功能仅在 Windows 中可用。".into())
}
#[cfg(not(windows))]
pub fn execute(_: &Target, _: &Path) -> Result<PathBuf> {
    Err("当前平台不支持 Windows 回收；没有永久删除兜底。".into())
}

#[cfg(not(windows))]
pub fn execute_with_cancel(
    _: &Target,
    _: &Path,
    _: std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> Result<PathBuf> {
    Err("当前平台不支持 Windows 回收。".into())
}
