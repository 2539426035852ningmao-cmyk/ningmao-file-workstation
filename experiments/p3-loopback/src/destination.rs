//! Local directory identity is retained from acceptance through staging and publication.
use crate::{Result, validate_name};
use std::{
    fs::File,
    io,
    path::{Component, Path, PathBuf},
};

pub struct Destination {
    path: PathBuf,
    chain: Vec<File>,
}
impl Destination {
    pub fn open(path: &Path) -> Result<Self> {
        if !path.is_absolute() || path.components().any(|c| matches!(c, Component::ParentDir)) {
            return Err("an absolute local directory without parent traversal is required".into());
        }
        let chain = open_chain(path)?;
        let result = Self {
            path: path.to_owned(),
            chain,
        };
        // Linux operations use the captured descriptor, not a replaceable path name.
        #[cfg(target_os = "linux")]
        if identity(&File::open(result.io_path())?)? != identity(result.last())? {
            return Err("directory capability is unavailable".into());
        }
        Ok(result)
    }
    fn last(&self) -> &File {
        self.chain.last().expect("nonempty directory chain")
    }
    #[cfg(not(windows))]
    fn io_path(&self) -> PathBuf {
        #[cfg(target_os = "linux")]
        {
            use std::os::fd::AsRawFd;
            PathBuf::from(format!("/proc/self/fd/{}", self.last().as_raw_fd()))
        }
        #[cfg(not(target_os = "linux"))]
        {
            self.path.clone()
        }
    }
    pub fn check(&self) -> Result<()> {
        let current = open_chain(&self.path)?;
        if identity(current.last().ok_or("missing directory")?)? != identity(self.last())? {
            return Err("receive directory identity changed".into());
        }
        Ok(())
    }
    pub fn stage(&self) -> Result<Staged> {
        self.check()?;
        let directory = self.last().try_clone()?;
        #[cfg(windows)]
        {
            use cap_std::fs::{Dir, OpenOptions, OpenOptionsExt};
            use windows_sys::Win32::Storage::FileSystem::{
                DELETE, FILE_ATTRIBUTE_TEMPORARY, FILE_GENERIC_READ, FILE_GENERIC_WRITE,
                FILE_SHARE_READ,
            };
            let dir = Dir::from_std_file(self.last().try_clone()?);
            let name = format!(".ningmao-receive-{}", uuid::Uuid::new_v4());
            let file = dir
                .open_with(
                    &name,
                    OpenOptions::new()
                        .read(true)
                        .write(true)
                        .create_new(true)
                        .access_mode(FILE_GENERIC_READ | FILE_GENERIC_WRITE | DELETE)
                        .share_mode(FILE_SHARE_READ)
                        .custom_flags(FILE_ATTRIBUTE_TEMPORARY),
                )?
                .into_std();
            Ok(Staged {
                file,
                owner: identity(self.last())?,
                published: false,
                _directory: directory,
            })
        }
        #[cfg(not(windows))]
        {
            use std::os::fd::AsRawFd;
            let anchor = PathBuf::from(format!("/proc/self/fd/{}", directory.as_raw_fd()));
            let temp = tempfile::Builder::new()
                .prefix(".ningmao-receive-")
                .tempfile_in(anchor)?;
            let (file, path) = temp.into_parts();
            Ok(Staged {
                file,
                path: Some(path),
                owner: identity(self.last())?,
                published: false,
                _directory: directory,
            })
        }
    }
    pub fn publish(&self, name: &str, #[allow(unused_mut)] mut temp: Staged) -> Result<()> {
        validate_name(name)?;
        self.check()?;
        if temp.owner != identity(self.last())? {
            return Err("staging belongs to another directory".into());
        }
        let p = Path::new(name);
        let stem = p.file_stem().ok_or("stem")?.to_string_lossy();
        let ext = p
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();
        for n in 0..1000 {
            let name = if n == 0 {
                name.to_owned()
            } else {
                format!("{stem} ({n}){ext}")
            };
            #[cfg(windows)]
            match rename_by_handle(&temp.file, self.last(), std::ffi::OsStr::new(&name)) {
                Ok(()) => {
                    temp.published = true;
                    return Ok(());
                }
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(e.into()),
            }
            #[cfg(not(windows))]
            {
                let path = temp.path.take().ok_or("staging path missing")?;
                match path.persist_noclobber(self.io_path().join(name)) {
                    Ok(_) => {
                        temp.published = true;
                        return Ok(());
                    }
                    Err(e) if e.error.kind() == io::ErrorKind::AlreadyExists => {
                        temp.path = Some(e.path)
                    }
                    Err(e) => return Err(e.error.into()),
                }
            }
        }
        Err("collision limit".into())
    }
}

#[cfg(windows)]
fn open_chain(path: &Path) -> Result<Vec<File>> {
    use std::{
        fs::OpenOptions,
        os::windows::fs::{MetadataExt, OpenOptionsExt},
        path::Prefix,
    };
    let mut current = PathBuf::new();
    let mut files = vec![];
    for part in path.components() {
        match part {
            Component::Prefix(p) => {
                let drive = match p.kind() {
                    Prefix::Disk(d) | Prefix::VerbatimDisk(d) => d,
                    _ => return Err("network/device paths are not accepted".into()),
                };
                let root = [drive as u16, b':' as u16, b'\\' as u16, 0];
                let kind = unsafe {
                    windows_sys::Win32::Storage::FileSystem::GetDriveTypeW(root.as_ptr())
                };
                if !matches!(kind, 2 | 3 | 6) {
                    return Err("receive directory requires a local writable volume".into());
                }
                current.push(p.as_os_str());
                continue;
            }
            Component::RootDir => current.push(part.as_os_str()),
            Component::Normal(p) => current.push(p),
            _ => return Err("unsupported directory component".into()),
        }
        // Pin directory identity against rename/deletion, as in the workstation Copy guard.
        // Actual create/rename/delete are descriptor-relative; no mutable pathname is used for I/O.
        let file = OpenOptions::new()
            .read(true)
            .share_mode(0x1 | 0x2)
            .custom_flags(0x02000000 | 0x00200000)
            .open(&current)?;
        let meta = file.metadata()?;
        if !meta.is_dir() || meta.file_attributes() & 0x400 != 0 {
            return Err("directory links/reparse points are not accepted".into());
        }
        files.push(file);
    }
    if files.is_empty() {
        return Err("directory required".into());
    }
    Ok(files)
}
#[cfg(windows)]
fn identity(file: &File) -> Result<(u64, u64)> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle,
    };
    let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0 {
        return Err(io::Error::last_os_error().into());
    }
    Ok((
        info.dwVolumeSerialNumber as u64,
        ((info.nFileIndexHigh as u64) << 32) | info.nFileIndexLow as u64,
    ))
}
#[cfg(target_os = "linux")]
fn open_chain(path: &Path) -> Result<Vec<File>> {
    use rustix::fs::{Mode, OFlags, open, openat};
    let flags = OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC;
    let mut files = vec![File::from(open("/", flags, Mode::empty())?)];
    for part in path.components() {
        match part {
            Component::RootDir => {}
            Component::Normal(p) => {
                let next = openat(
                    files.last().ok_or("directory required")?,
                    p,
                    flags,
                    Mode::empty(),
                )?;
                files.push(File::from(next));
            }
            _ => return Err("unsupported directory component".into()),
        }
    }
    Ok(files)
}
#[cfg(target_os = "linux")]
fn identity(file: &File) -> Result<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    let meta = file.metadata()?;
    Ok((meta.dev(), meta.ino()))
}

#[cfg(not(any(windows, target_os = "linux")))]
fn open_chain(_: &Path) -> Result<Vec<File>> {
    Err("this probe supports Windows and Linux only".into())
}
#[cfg(not(any(windows, target_os = "linux")))]
fn identity(_: &File) -> Result<(u64, u64)> {
    Err("unsupported platform".into())
}

#[cfg(windows)]
fn rename_by_handle(file: &File, dir: &File, name: &std::ffi::OsStr) -> io::Result<()> {
    use std::os::windows::{ffi::OsStrExt, io::AsRawHandle};
    use windows_sys::Win32::{
        Foundation::HANDLE,
        Storage::FileSystem::{
            FILE_ATTRIBUTE_NORMAL, FILE_BASIC_INFO, FILE_RENAME_INFO, FileBasicInfo,
            SetFileInformationByHandle,
        },
    };
    // The staged handle already owns DELETE access; never reopen it by pathname.
    let renamed = file;
    let basic = FILE_BASIC_INFO {
        CreationTime: 0,
        LastAccessTime: 0,
        LastWriteTime: 0,
        ChangeTime: 0,
        FileAttributes: FILE_ATTRIBUTE_NORMAL,
    };
    if unsafe {
        SetFileInformationByHandle(
            renamed.as_raw_handle(),
            FileBasicInfo,
            (&basic as *const FILE_BASIC_INFO).cast(),
            std::mem::size_of::<FILE_BASIC_INFO>() as u32,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    #[repr(C)]
    struct Rename {
        flags: u32,
        root: HANDLE,
        length: u32,
        name: [u16; 256],
    }
    let wide: Vec<u16> = name.encode_wide().collect();
    if wide.len() > 255 {
        return Err(io::Error::other("target name too long"));
    }
    // ReplaceIfExists/flags is zero: an existing target must fail, never be overwritten.
    let mut info = Rename {
        flags: 0,
        root: dir.as_raw_handle(),
        length: (wide.len() * 2) as u32,
        name: [0; 256],
    };
    info.name[..wide.len()].copy_from_slice(&wide);
    assert_eq!(
        std::mem::offset_of!(Rename, name),
        std::mem::offset_of!(FILE_RENAME_INFO, FileName)
    );
    let mut status = windows_sys::Win32::System::IO::IO_STATUS_BLOCK::default();
    let result = unsafe {
        windows_sys::Wdk::Storage::FileSystem::NtSetInformationFile(
            renamed.as_raw_handle(),
            &mut status,
            (&info as *const Rename).cast(),
            std::mem::size_of::<Rename>() as u32,
            windows_sys::Wdk::Storage::FileSystem::FileRenameInformation,
        )
    };
    if result < 0 {
        return Err(io::Error::from_raw_os_error(unsafe {
            windows_sys::Win32::Foundation::RtlNtStatusToDosError(result)
        } as i32));
    }
    Ok(())
}

pub struct Staged {
    file: File,
    owner: (u64, u64),
    published: bool,
    #[cfg(not(windows))]
    path: Option<tempfile::TempPath>,
    // Must drop after TempPath: its /proc descriptor remains valid during cleanup.
    _directory: File,
}
impl Staged {
    pub fn as_file_mut(&mut self) -> &mut File {
        &mut self.file
    }
}
impl std::io::Write for Staged {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.file.write(bytes)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.file.flush()
    }
}
impl Drop for Staged {
    fn drop(&mut self) {
        #[cfg(windows)]
        if !self.published {
            use std::os::windows::io::AsRawHandle;
            use windows_sys::Win32::Storage::FileSystem::{
                FILE_DISPOSITION_INFO, FileDispositionInfo, SetFileInformationByHandle,
            };
            let info = FILE_DISPOSITION_INFO { DeleteFile: true };
            // Delete the captured temporary file, even if a pathname was changed by another process.
            let _ = unsafe {
                SetFileInformationByHandle(
                    self.file.as_raw_handle(),
                    FileDispositionInfo,
                    (&info as *const FILE_DISPOSITION_INFO).cast(),
                    std::mem::size_of::<FILE_DISPOSITION_INFO>() as u32,
                )
            };
        }
    }
}
