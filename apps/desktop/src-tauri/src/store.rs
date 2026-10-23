use base64::Engine;
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use std::{
    fs::{self, File, OpenOptions},
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

pub type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Clone, Serialize)]
pub struct Shelf {
    pub id: i64,
    pub name: String,
    pub kind: String,
    pub root: Option<String>,
    pub available: bool,
}
#[derive(Clone, Serialize)]
pub struct Item {
    pub id: i64,
    pub shelf_id: i64,
    pub path: String,
    pub name: String,
    pub kind: String,
    pub bytes: u64,
    pub modified: u64,
    pub status: String,
    pub tags: Vec<String>,
}
#[derive(Clone, Serialize)]
pub struct Job {
    pub id: i64,
    pub shelf_id: i64,
    pub status: String,
    pub message: String,
    pub staging: Option<String>,
}
#[derive(Serialize)]
pub struct Snapshot {
    pub shelves: Vec<Shelf>,
    pub items: Vec<Item>,
    pub jobs: Vec<Job>,
}

pub struct Store {
    db: Connection,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let db = Connection::open(path).map_err(err)?;
        db.busy_timeout(Duration::from_secs(5)).map_err(err)?;
        let version: i64 = db
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(err)?;
        if version > 1 {
            return Err("数据库版本较新，请使用兼容版本；没有修改数据库。".into());
        }
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS shelves(id INTEGER PRIMARY KEY, name TEXT NOT NULL,
                kind TEXT NOT NULL CHECK(kind IN ('persistent','session','bound')), root TEXT UNIQUE);
            CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, shelf_id INTEGER NOT NULL REFERENCES shelves(id),
                path TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
                UNIQUE(shelf_id,path));
            CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY, shelf_id INTEGER NOT NULL REFERENCES shelves(id),
                status TEXT NOT NULL, message TEXT NOT NULL, staging TEXT);
            INSERT OR IGNORE INTO shelves(id,name,kind) VALUES(1,'灵感收集','persistent'),(2,'本次中转','session');
            UPDATE jobs SET status='interrupted',message='上次操作异常中断；已完成文件保留，残留临时文件未自动删除。'
                WHERE status IN ('queued','copying');
            PRAGMA user_version=1;
            COMMIT;").map_err(err)?;
        Ok(Self { db })
    }
    pub fn integrity_check(&self) -> Result<()> {
        let value: String = self
            .db
            .pragma_query_value(None, "integrity_check", |r| r.get(0))
            .map_err(err)?;
        if value == "ok" { Ok(()) } else { Err(value) }
    }
    pub fn shelves(&self) -> Result<Vec<Shelf>> {
        let mut stmt = self
            .db
            .prepare("SELECT id,name,kind,root FROM shelves ORDER BY id")
            .map_err(err)?;
        stmt.query_map([], |r| {
            let root: Option<String> = r.get(3)?;
            let available = root.as_ref().is_none_or(|s| Path::new(s).is_dir());
            Ok(Shelf {
                id: r.get(0)?,
                name: r.get(1)?,
                kind: r.get(2)?,
                root,
                available,
            })
        })
        .map_err(err)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(err)
    }
    fn shelf(&self, id: i64) -> Result<Shelf> {
        self.shelves()?
            .into_iter()
            .find(|s| s.id == id)
            .ok_or("文件架不存在。".into())
    }
    pub fn bind_directory(&mut self, path: &Path) -> Result<i64> {
        let path = canonical_user_path(path)?;
        if !path.is_dir() {
            return Err("请选择真实文件夹。".into());
        }
        let value = path_text(&path)?;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| value.clone());
        self.db
            .execute(
                "INSERT OR IGNORE INTO shelves(name,kind,root) VALUES(?1,'bound',?2)",
                params![name, value],
            )
            .map_err(err)?;
        self.db
            .query_row("SELECT id FROM shelves WHERE root=?1", [value], |r| {
                r.get(0)
            })
            .map_err(err)
    }
    fn insert(&self, shelf: i64, path: &Path) -> Result<i64> {
        let value = path_text(path)?;
        let name = path
            .file_name()
            .ok_or("路径没有文件名。")?
            .to_str()
            .ok_or("文件名不是有效 Unicode。")?;
        self.db
            .execute(
                "INSERT OR IGNORE INTO items(shelf_id,path,name,position)
            VALUES(?1,?2,?3,COALESCE((SELECT MAX(position)+1 FROM items WHERE shelf_id=?1),0))",
                params![shelf, value, name],
            )
            .map_err(err)?;
        self.db
            .query_row(
                "SELECT id FROM items WHERE shelf_id=?1 AND path=?2",
                params![shelf, value],
                |r| r.get(0),
            )
            .map_err(err)
    }
    pub fn add_reference(&mut self, shelf: i64, path: &Path) -> Result<i64> {
        if self.shelf(shelf)?.kind == "bound" {
            return Err("真实目录只能通过复制添加文件。".into());
        }
        self.insert(shelf, &canonical_user_path(path)?)
    }
    pub fn record_copy(&mut self, shelf: i64, path: &Path) -> Result<i64> {
        let root = self.shelf(shelf)?.root.ok_or("没有绑定目录。")?;
        if path.parent() != Some(Path::new(&root)) {
            return Err("目标超出绑定目录。".into());
        }
        self.insert(shelf, path)
    }
    pub fn relocation_source(&self, id: i64) -> Result<PathBuf> {
        let (path, kind): (String, String) = self
            .db
            .query_row(
                "SELECT i.path,s.kind FROM items i JOIN shelves s ON s.id=i.shelf_id WHERE i.id=?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(err)?
            .ok_or("文件记录不存在，请刷新后重试。")?;
        if kind == "bound" {
            return Err("绑定目录中的记录不能改为其他路径，请恢复原目录位置。".into());
        }
        if fs::symlink_metadata(&path).is_ok() {
            return Err("原引用已可访问，请刷新状态；无需重新定位。".into());
        }
        Ok(PathBuf::from(path))
    }
    pub fn relink_reference(&mut self, id: i64, expected: &Path, replacement: &Path) -> Result<()> {
        let current = self.relocation_source(id)?;
        if current != expected {
            return Err("引用已被更新，请刷新后重试；本次没有修改记录。".into());
        }
        let replacement = canonical_user_path(replacement)?;
        let name = replacement
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("目标没有有效文件名。")?;
        // One atomic UPDATE keeps identity, tags and position; UNIQUE refuses silent merging.
        let changed = self.db.execute("UPDATE items SET path=?1,name=?2 WHERE id=?3 AND path=?4",
            params![path_text(&replacement)?, name, id, path_text(expected)?]).map_err(|e| {
                if matches!(&e, rusqlite::Error::SqliteFailure(code, _) if code.code == rusqlite::ErrorCode::ConstraintViolation) {
                    "目标已在当前文件架中；两条引用和分类均保留，请选择其他目标。".into()
                } else { err(e) }
            })?;
        if changed != 1 {
            return Err("引用已变化，请刷新后重试。".into());
        }
        Ok(())
    }
    pub fn remove_reference(&mut self, id: i64) -> Result<()> {
        let kind: String = self
            .db
            .query_row(
                "SELECT s.kind FROM items i JOIN shelves s ON s.id=i.shelf_id WHERE i.id=?1",
                [id],
                |r| r.get(0),
            )
            .map_err(err)?;
        if kind == "bound" {
            return Err("目录文件不能通过移除引用删除；本阶段不提供实体删除。".into());
        }
        self.db
            .execute("DELETE FROM items WHERE id=?1", [id])
            .map_err(err)?;
        Ok(())
    }
    pub fn set_tags(&mut self, id: i64, tags: Vec<String>) -> Result<()> {
        if tags.len() > 32 || tags.iter().any(|t| t.len() > 128) {
            return Err("标签过长或过多。".into());
        }
        if self
            .db
            .execute(
                "UPDATE items SET tags=?1 WHERE id=?2",
                params![serde_json::to_string(&tags).map_err(err)?, id],
            )
            .map_err(err)?
            == 0
        {
            return Err("文件记录不存在。".into());
        }
        Ok(())
    }
    pub fn reorder(&mut self, shelf: i64, ids: &[i64]) -> Result<()> {
        let expected: Vec<i64> = self
            .db
            .prepare("SELECT id FROM items WHERE shelf_id=?1 ORDER BY id")
            .map_err(err)?
            .query_map([shelf], |r| r.get(0))
            .map_err(err)?
            .collect::<std::result::Result<_, _>>()
            .map_err(err)?;
        let mut sorted = ids.to_vec();
        sorted.sort_unstable();
        if sorted != expected {
            return Err("排序记录已变化，请刷新后重试。".into());
        }
        let tx = self.db.transaction().map_err(err)?;
        for (position, id) in ids.iter().enumerate() {
            tx.execute(
                "UPDATE items SET position=?1 WHERE id=?2 AND shelf_id=?3",
                params![position as i64, id, shelf],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)
    }
    pub fn snapshot(&mut self) -> Result<Snapshot> {
        let shelves = self.shelves()?;
        // Shallow enumeration only of explicitly bound roots; never scan reference parents.
        for shelf in &shelves {
            if let Some(root) = &shelf.root
                && let Ok(entries) = fs::read_dir(root)
            {
                for entry in entries.flatten() {
                    if entry
                        .file_name()
                        .to_string_lossy()
                        .starts_with(".ningmao-copy-")
                    {
                        continue;
                    }
                    if let Ok(path) = canonical_user_path(&entry.path()) {
                        self.insert(shelf.id, &path)?;
                    }
                }
            }
        }
        let mut stmt = self
            .db
            .prepare("SELECT id,shelf_id,path,name,tags FROM items ORDER BY shelf_id,position,id")
            .map_err(err)?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        let items = rows
            .into_iter()
            .map(|(id, shelf_id, path, name, tags)| {
                let meta = fs::symlink_metadata(&path);
                let (status, bytes, modified, kind) = match meta {
                    Ok(m) if !is_link(&m) => (
                        "normal",
                        m.len(),
                        m.modified()
                            .ok()
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs())
                            .unwrap_or(0),
                        if m.is_dir() {
                            "folder".into()
                        } else {
                            Path::new(&path)
                                .extension()
                                .and_then(|s| s.to_str())
                                .unwrap_or("file")
                                .to_lowercase()
                        },
                    ),
                    Ok(_) => ("unsupported", 0, 0, "link".into()),
                    Err(e) => (
                        if e.kind() == std::io::ErrorKind::NotFound {
                            "missing"
                        } else {
                            "unreadable"
                        },
                        0,
                        0,
                        "file".into(),
                    ),
                };
                Ok(Item {
                    id,
                    shelf_id,
                    path,
                    name,
                    kind,
                    bytes,
                    modified,
                    status: status.into(),
                    tags: serde_json::from_str(&tags).map_err(err)?,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let jobs = self
            .db
            .prepare(
                "SELECT id,shelf_id,status,message,staging FROM jobs ORDER BY id DESC LIMIT 20",
            )
            .map_err(err)?
            .query_map([], |r| {
                Ok(Job {
                    id: r.get(0)?,
                    shelf_id: r.get(1)?,
                    status: r.get(2)?,
                    message: r.get(3)?,
                    staging: r.get(4)?,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(Snapshot {
            shelves,
            items,
            jobs,
        })
    }
    pub fn item_path(&self, id: i64) -> Result<PathBuf> {
        self.db
            .query_row("SELECT path FROM items WHERE id=?1", [id], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .map_err(err)?
            .map(PathBuf::from)
            .ok_or("文件记录不存在。".into())
    }
    pub fn begin_job(&mut self, shelf: i64, message: &str) -> Result<i64> {
        self.shelf(shelf)?;
        self.db
            .execute(
                "INSERT INTO jobs(shelf_id,status,message) VALUES(?1,'queued',?2)",
                params![shelf, message],
            )
            .map_err(err)?;
        Ok(self.db.last_insert_rowid())
    }
    pub fn stage_job(&mut self, id: i64, path: &Path) -> Result<()> {
        self.db
            .execute(
                "UPDATE jobs SET status='copying',staging=?1 WHERE id=?2",
                params![path_text(path)?, id],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn finish_job(&mut self, id: i64, status: &str, message: &str) -> Result<()> {
        self.db
            .execute(
                "UPDATE jobs SET status=?1,message=?2 WHERE id=?3",
                params![status, message, id],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn clean_exit(&mut self) -> Result<()> {
        let tx = self.db.transaction().map_err(err)?;
        tx.execute(
            "DELETE FROM items WHERE shelf_id IN (SELECT id FROM shelves WHERE kind='session')",
            [],
        )
        .map_err(err)?;
        tx.commit().map_err(err)?;
        self.db
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(err)
    }
    pub fn plan_copy(&self, shelf: i64, source: &Path) -> Result<CopyPlan> {
        let root = PathBuf::from(self.shelf(shelf)?.root.ok_or("请选择已绑定的真实目录。")?);
        let source = canonical_user_path(source)?;
        if !source.is_file() {
            return Err("当前闭环只复制文件；文件夹请作为临时引用添加，不会递归复制。".into());
        }
        let _ = directory_guard(&root)?;
        Ok(CopyPlan { root, source })
    }
    pub fn copy_one(
        &mut self,
        shelf: i64,
        source: &Path,
        cancel: &AtomicBool,
        progress: impl FnMut(u64, u64),
    ) -> Result<PathBuf> {
        let target = self
            .plan_copy(shelf, source)?
            .execute(cancel, progress, |_| Ok(()))?;
        self.record_copy(shelf, &target)?;
        Ok(target)
    }
}

fn path_text(path: &Path) -> Result<String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or("路径不是有效 Unicode。".into())
}
pub fn canonical_user_path(path: &Path) -> Result<PathBuf> {
    let text = path_text(path)?;
    if !path.is_absolute() || text.contains('\0') || text.len() > 32760 || text.starts_with(r"\\.\")
    {
        return Err("只接受有效的绝对文件路径。".into());
    }
    #[cfg(windows)]
    if text
        .trim_start_matches(r"\\?\")
        .get(2..)
        .is_some_and(|s| s.contains(':'))
    {
        return Err("不支持设备路径或 NTFS 附加数据流。".into());
    }
    let meta = fs::symlink_metadata(path).map_err(err)?;
    if is_link(&meta) {
        return Err("当前阶段不操作符号链接或重解析点。".into());
    }
    if !meta.is_file() && !meta.is_dir() {
        return Err("不是普通文件或文件夹。".into());
    }
    fs::canonicalize(path).map_err(err)
}
fn is_link(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        meta.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        meta.file_type().is_symlink()
    }
}
fn directory_guard(path: &Path) -> Result<File> {
    let mut opts = OpenOptions::new();
    opts.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Hold the directory against deletion/renaming during publication; do not follow a reparse point.
        opts.share_mode(0x1 | 0x2)
            .custom_flags(0x02000000 | 0x00200000);
    }
    let file = opts.open(path).map_err(err)?;
    let meta = file.metadata().map_err(err)?;
    if !meta.is_dir() || is_link(&meta) {
        return Err("绑定目录不可用或已被替换为链接，请重新绑定。".into());
    }
    Ok(file)
}
pub struct CopyPlan {
    root: PathBuf,
    source: PathBuf,
}
impl CopyPlan {
    pub fn execute(
        self,
        cancel: &AtomicBool,
        mut progress: impl FnMut(u64, u64),
        mut staging: impl FnMut(&Path) -> Result<()>,
    ) -> Result<PathBuf> {
        let _guard = directory_guard(&self.root)?;
        let mut opts = OpenOptions::new();
        opts.read(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            // Allow other readers, deny writers/deletion while bytes are being copied.
            opts.share_mode(0x1).custom_flags(0x00200000);
        }
        let mut source = opts.open(&self.source).map_err(err)?;
        let before = source.metadata().map_err(err)?;
        if !before.is_file() || is_link(&before) {
            return Err("来源不是可安全复制的普通文件。".into());
        }
        if cancel.load(Ordering::SeqCst) {
            return Err("已取消，原文件保留。".into());
        }
        let mut temp = tempfile::Builder::new()
            .prefix(".ningmao-copy-")
            .tempfile_in(&self.root)
            .map_err(err)?;
        let copy_result = (|| {
            staging(temp.path())?;
            let mut done = 0;
            let mut buf = vec![0u8; 1024 * 1024];
            loop {
                if cancel.load(Ordering::SeqCst) {
                    return Err("已取消；已完成文件保留，当前未完成文件已清理。".into());
                }
                let n = source.read(&mut buf).map_err(err)?;
                if n == 0 {
                    break;
                }
                temp.write_all(&buf[..n]).map_err(err)?;
                done += n as u64;
                progress(done, before.len());
            }
            if done != before.len()
                || source.metadata().map_err(err)?.modified().ok() != before.modified().ok()
            {
                return Err("复制期间来源发生变化，未发布目标；请重试。".into());
            }
            temp.as_file().sync_all().map_err(err)?;
            if cancel.load(Ordering::SeqCst) {
                return Err("已取消；当前未完成文件已清理。".into());
            }
            Ok(())
        })();
        if let Err(error) = copy_result {
            return match temp.close() {
                Ok(()) => Err(error),
                Err(cleanup) => Err(format!(
                    "{error} 临时文件清理失败：{cleanup}；任务记录保留其位置。"
                )),
            };
        }
        let name = self.source.file_name().ok_or("来源没有文件名。")?;
        let stem = self.source.file_stem().unwrap_or(name).to_string_lossy();
        let ext = self
            .source
            .extension()
            .map(|s| format!(".{}", s.to_string_lossy()))
            .unwrap_or_default();
        for index in 0..10_000 {
            if cancel.load(Ordering::SeqCst) {
                temp.close().map_err(err)?;
                return Err("已取消。".into());
            }
            let target = self.root.join(if index == 0 {
                name.to_os_string()
            } else {
                format!("{stem} ({index}){ext}").into()
            });
            // A pre-existing directory is also a name collision. The atomic persist below
            // still arbitrates files created after this advisory check.
            if fs::symlink_metadata(&target).is_ok() {
                continue;
            }
            match temp.persist_noclobber(&target) {
                Ok(_) => {
                    progress(before.len(), before.len());
                    return Ok(target);
                }
                Err(e) if e.error.kind() == std::io::ErrorKind::AlreadyExists => {
                    temp = e.file;
                }
                Err(e) => {
                    let message = err(e.error);
                    e.file
                        .close()
                        .map_err(|e| format!("{message} 临时文件清理失败：{e}"))?;
                    return Err(message);
                }
            }
        }
        temp.close().map_err(err)?;
        Err("同名文件过多，未覆盖任何已有文件。".into())
    }
}

pub fn thumbnail(path: &Path) -> Result<Option<String>> {
    let path = canonical_user_path(path)?;
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !["png", "jpg", "jpeg", "webp"].contains(&ext.as_str()) {
        return Ok(None);
    }
    if fs::metadata(&path).map_err(err)?.len() > 24 * 1024 * 1024 {
        return Err("图片超过当前 24 MiB 解码限制，保留文件图标。".into());
    }
    let mut reader = image::ImageReader::open(path)
        .map_err(err)?
        .with_guessed_format()
        .map_err(err)?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    let small = reader.decode().map_err(err)?.thumbnail(320, 320);
    let mut bytes = Cursor::new(Vec::new());
    small
        .write_to(&mut bytes, image::ImageFormat::Png)
        .map_err(err)?;
    Ok(Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes.into_inner())
    )))
}
