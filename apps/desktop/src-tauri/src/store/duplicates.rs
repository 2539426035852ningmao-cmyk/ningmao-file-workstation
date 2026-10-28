//! Explicit, bounded, read-only analysis of selected Windows file references.
use super::{Result, Store, canonical_user_path, is_link, search};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{File, OpenOptions},
    io::{Read, Seek, SeekFrom},
    os::windows::{fs::OpenOptionsExt, io::AsRawHandle},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::SystemTime,
};
use windows::Win32::{
    Foundation::HANDLE,
    Storage::FileSystem::{BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle},
};

const MAX_ITEMS: usize = 32;
const MAX_BYTES: u64 = 256 * 1024 * 1024;

pub(crate) struct ScanPermit<'a>(&'a AtomicBool);
impl<'a> ScanPermit<'a> {
    pub(crate) fn acquire(slot: &'a AtomicBool) -> Result<Self> {
        slot.compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
            .map_err(|_| "已有重复分析正在进行，请稍后重试。".to_string())?;
        Ok(Self(slot))
    }
}
impl Drop for ScanPermit<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[derive(Serialize)]
pub struct DuplicateReport {
    pub same_entity: Vec<Vec<i64>>,
    pub duplicate_contents: Vec<Vec<Vec<i64>>>,
}

pub struct DuplicatePlan(Vec<(i64, PathBuf)>);
pub struct PendingDuplicateScan {
    selected: Vec<(i64, PathBuf)>,
    files: Vec<Opened>,
    _directories: Vec<File>,
    report: DuplicateReport,
}
#[derive(Clone, Copy, PartialEq, Eq)]
struct Identity(u32, u32, u32);
struct Opened {
    file: File,
    identity: Identity,
    length: u64,
    modified: SystemTime,
}
struct ContentGroup {
    length: u64,
    digest: Vec<u8>,
    representative: usize,
    references: Vec<Vec<i64>>,
}
fn identity(file: &File) -> Result<Identity> {
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    unsafe { GetFileInformationByHandle(HANDLE(file.as_raw_handle()), &mut info) }
        .map_err(|_| "无法确认文件身份，请重试。".to_string())?;
    Ok(Identity(
        info.dwVolumeSerialNumber,
        info.nFileIndexHigh,
        info.nFileIndexLow,
    ))
}
fn lock_directory(path: &Path) -> Result<File> {
    let file = OpenOptions::new()
        .read(true)
        .share_mode(1)
        .custom_flags(0x02000000 | 0x00200000)
        .open(path)
        .map_err(|_| "文件路径暂不可安全访问，请重试。".to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| "无法检查文件路径。".to_string())?;
    if !metadata.is_dir() || is_link(&metadata) {
        return Err("不支持链接或重解析点路径。".into());
    }
    Ok(file)
}
fn open_selected(path: &Path, dirs: &mut Vec<File>) -> Result<Opened> {
    if !path.is_absolute() || !search::local_metadata_allowed(path) {
        return Err("仅支持已连接的本地文件。".into());
    }
    let mut parents: Vec<_> = path
        .ancestors()
        .skip(1)
        .filter(|p| p.is_absolute())
        .collect();
    parents.reverse();
    for parent in parents {
        dirs.push(lock_directory(parent)?);
    }
    if canonical_user_path(path).map_err(|_| "文件已变化或无法访问。")? != path {
        return Err("文件路径已变化，请重新选择。".into());
    }
    let file = OpenOptions::new()
        .read(true)
        .share_mode(1)
        .custom_flags(0x00200000)
        .open(path)
        .map_err(|_| "文件被占用或无法安全读取。".to_string())?;
    let metadata = file
        .metadata()
        .map_err(|_| "无法检查文件状态。".to_string())?;
    if !metadata.is_file() || is_link(&metadata) {
        return Err("只能分析普通文件；不支持文件夹和链接。".into());
    }
    let identity = identity(&file)?;
    let modified = metadata
        .modified()
        .map_err(|_| "无法确认文件状态。".to_string())?;
    Ok(Opened {
        file,
        identity,
        length: metadata.len(),
        modified,
    })
}
fn identical_bytes(
    files: &mut [Opened],
    selected: &[(i64, PathBuf)],
    left_index: usize,
    right_index: usize,
    check: &mut impl FnMut(i64, &Path) -> Result<()>,
) -> Result<bool> {
    let (first, second) = if left_index < right_index {
        let (left, right) = files.split_at_mut(right_index);
        (&mut left[left_index], &mut right[0])
    } else {
        let (left, right) = files.split_at_mut(left_index);
        (&mut right[0], &mut left[right_index])
    };
    first
        .file
        .seek(SeekFrom::Start(0))
        .map_err(|_| "无法重新读取文件。")?;
    second
        .file
        .seek(SeekFrom::Start(0))
        .map_err(|_| "无法重新读取文件。")?;
    let mut left = vec![0u8; 1024 * 1024];
    let mut right = vec![0u8; 1024 * 1024];
    let mut remaining = first.length;
    while remaining > 0 {
        check(selected[left_index].0, &selected[left_index].1)?;
        check(selected[right_index].0, &selected[right_index].1)?;
        let size = remaining.min(left.len() as u64) as usize;
        first
            .file
            .read_exact(&mut left[..size])
            .map_err(|_| "文件读取不完整。")?;
        second
            .file
            .read_exact(&mut right[..size])
            .map_err(|_| "文件读取不完整。")?;
        if left[..size] != right[..size] {
            return Ok(false);
        }
        remaining -= size as u64;
    }
    Ok(true)
}

impl Store {
    /// Capture only the explicitly selected active references, without reading file content.
    pub fn prepare_duplicate_scan(&self, scope: Option<i64>, ids: &[i64]) -> Result<DuplicatePlan> {
        if ids.len() < 2
            || ids.len() > MAX_ITEMS
            || ids.iter().collect::<HashSet<_>>().len() != ids.len()
        {
            return Err(format!("请选择 2 至 {MAX_ITEMS} 个不同文件引用。"));
        }
        self.validate_item_scope(scope, ids)?;
        Ok(DuplicatePlan(
            ids.iter()
                .map(|&id| self.item_path(id).map(|path| (id, path)))
                .collect::<Result<_>>()?,
        ))
    }
    /// The reference must still point to the same file after the analysis finishes.
    pub fn finish_duplicate_scan(
        &self,
        scope: Option<i64>,
        pending: PendingDuplicateScan,
    ) -> Result<DuplicateReport> {
        let ids: Vec<_> = pending.selected.iter().map(|(id, _)| *id).collect();
        self.validate_item_scope(scope, &ids)
            .map_err(|_| "选中引用已变化，请重新选择。")?;
        for (id, path) in &pending.selected {
            if self
                .item_path(*id)
                .map_err(|_| "选中引用已变化，请重新选择。")?
                != *path
            {
                return Err("文件引用已变化，请重新选择。".into());
            }
        }
        for opened in &pending.files {
            let meta = opened
                .file
                .metadata()
                .map_err(|_| "文件状态已变化。".to_string())?;
            if is_link(&meta)
                || !meta.is_file()
                || meta.len() != opened.length
                || meta.modified().ok() != Some(opened.modified)
                || identity(&opened.file)? != opened.identity
            {
                return Err("文件分析期间发生变化，请重新分析。".into());
            }
        }
        Ok(pending.report)
    }
}

impl DuplicatePlan {
    /// Opens guarded handles and rechecks authorization before each bounded read.
    pub fn analyze_checked(
        self,
        mut check: impl FnMut(i64, &Path) -> Result<()>,
    ) -> Result<PendingDuplicateScan> {
        let mut directories = Vec::new();
        let mut files = Vec::with_capacity(self.0.len());
        for (id, path) in &self.0 {
            check(*id, path)?;
            files.push(open_selected(path, &mut directories)?);
        }
        let total = files
            .iter()
            .try_fold(0u64, |sum, f| sum.checked_add(f.length))
            .ok_or("文件总大小超出限制。")?;
        if total > MAX_BYTES {
            return Err("本次选择超过 256 MiB，请减少选择后重试。".into());
        }
        let mut entities: Vec<(Identity, Vec<i64>, usize)> = Vec::new();
        for (index, ((id, _), opened)) in self.0.iter().zip(&files).enumerate() {
            if let Some(entity) = entities
                .iter_mut()
                .find(|entity| entity.0 == opened.identity)
            {
                entity.1.push(*id);
            } else {
                entities.push((opened.identity, vec![*id], index));
            }
        }
        let same_entity = entities
            .iter()
            .filter(|e| e.1.len() > 1)
            .map(|e| e.1.clone())
            .collect();
        let mut hash_groups: Vec<ContentGroup> = Vec::new();
        for (_, ids, index) in &entities {
            let len = files[*index].length;
            if entities
                .iter()
                .filter(|entity| files[entity.2].length == len)
                .count()
                < 2
            {
                continue;
            }
            let file = &mut files[*index].file;
            let mut hasher = Sha256::new();
            let mut buffer = vec![0u8; 1024 * 1024];
            loop {
                check(self.0[*index].0, &self.0[*index].1)?;
                let n = file
                    .read(&mut buffer)
                    .map_err(|_| "读取文件失败，请重试。".to_string())?;
                if n == 0 {
                    break;
                }
                hasher.update(&buffer[..n]);
            }
            let digest = hasher.finalize().to_vec();
            let mut matching = None;
            for (i, group) in hash_groups.iter().enumerate() {
                if group.length == len
                    && group.digest == digest
                    && identical_bytes(
                        &mut files,
                        &self.0,
                        group.representative,
                        *index,
                        &mut check,
                    )?
                {
                    matching = Some(i);
                    break;
                }
            }
            if let Some(i) = matching {
                hash_groups[i].references.push(ids.clone());
            } else {
                hash_groups.push(ContentGroup {
                    length: len,
                    digest,
                    representative: *index,
                    references: vec![ids.clone()],
                });
            }
        }
        let duplicate_contents = hash_groups
            .into_iter()
            .filter(|group| group.references.len() > 1)
            .map(|group| group.references)
            .collect();
        Ok(PendingDuplicateScan {
            selected: self.0,
            files,
            _directories: directories,
            report: DuplicateReport {
                same_entity,
                duplicate_contents,
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn single_analysis_permit_releases_on_drop() {
        let slot = AtomicBool::new(false);
        let first = ScanPermit::acquire(&slot).unwrap();
        assert!(ScanPermit::acquire(&slot).is_err());
        drop(first);
        assert!(ScanPermit::acquire(&slot).is_ok());
    }
    #[test]
    fn concurrent_windows_have_one_worker_and_error_releases_permit() {
        use std::sync::Barrier;
        let slot = AtomicBool::new(false);
        let barrier = Barrier::new(8);
        std::thread::scope(|scope| {
            let handles: Vec<_> = (0..8)
                .map(|_| {
                    scope.spawn(|| {
                        barrier.wait();
                        let permit = ScanPermit::acquire(&slot);
                        barrier.wait();
                        permit.is_ok()
                    })
                })
                .collect();
            assert_eq!(
                handles
                    .into_iter()
                    .map(|h| h.join().unwrap())
                    .filter(|v| *v)
                    .count(),
                1
            );
        });
        fn fail(slot: &AtomicBool) -> Result<()> {
            let _permit = ScanPermit::acquire(slot)?;
            Err("synthetic failure".into())
        }
        assert!(fail(&slot).is_err());
        assert!(ScanPermit::acquire(&slot).is_ok());
    }
    #[test]
    fn byte_confirmation_rejects_same_length_different_content() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.txt");
        let b = dir.path().join("b.txt");
        std::fs::write(&a, b"alpha").unwrap();
        std::fs::write(&b, b"omega").unwrap();
        let a = std::fs::canonicalize(a).unwrap();
        let b = std::fs::canonicalize(b).unwrap();
        let selected = vec![(1, a.clone()), (2, b.clone())];
        let mut dirs = vec![];
        let mut files = vec![
            open_selected(&a, &mut dirs).unwrap(),
            open_selected(&b, &mut dirs).unwrap(),
        ];
        assert!(!identical_bytes(&mut files, &selected, 0, 1, &mut |_, _| Ok(())).unwrap());
    }
}
