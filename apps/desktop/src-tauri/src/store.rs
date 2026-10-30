use base64::Engine;
#[path = "store/chat.rs"]
mod chat;
#[allow(unused_imports)]
pub use chat::{ChatConfig, ChatMessage, ChatRequest, ChatSession, PromptMessage};
#[cfg(windows)]
#[path = "store/duplicates.rs"]
mod duplicates;
#[path = "store/search.rs"]
mod search;
#[cfg(windows)]
pub use duplicates::{DuplicatePlan, DuplicateReport, PendingDuplicateScan};
use rusqlite::{Connection, OptionalExtension, params};
pub use search::{SearchCatalog, SearchHit, SearchReference, SearchResponse};
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
pub struct ShelfIdentity {
    pub id: i64,
    pub name: String,
    pub kind: String,
}
#[derive(Serialize)]
pub struct PeekItem {
    pub id: i64,
    pub name: String,
    pub kind: String,
    pub status: String,
    pub thumbnail: Option<String>,
}
#[derive(Serialize)]
pub struct EntryPreview {
    pub shelf: ShelfIdentity,
    pub total: usize,
    pub items: Vec<PeekItem>,
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
#[derive(Serialize)]
pub struct ManagedReference {
    pub id: i64,
    pub shelf_id: i64,
    pub path: String,
    pub name: String,
    pub kind: String,
    pub tags: Vec<String>,
}
#[derive(Serialize)]
pub struct ManagementSnapshot {
    pub shelves: Vec<ShelfIdentity>,
    pub items: Vec<ManagedReference>,
    pub jobs: Vec<Job>,
}

#[derive(Clone, Serialize)]
pub struct TrashEntry {
    pub id: i64,
    pub entity: String,
    pub name: String,
    pub shelf_id: i64,
    pub shelf_name: String,
    pub shelf_kind: String,
    pub path: Option<String>,
    pub removed_at: i64,
    pub children: usize,
}
#[derive(Clone, Serialize)]
pub struct RecycleActivity {
    pub id: i64,
    pub shelf_id: i64,
    pub name: String,
    pub status: String,
    pub message: String,
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
        if version > 2 {
            return Err("数据库版本较新，请使用兼容版本；没有修改数据库。".into());
        }
        // VACUUM INTO reads a consistent SQLite snapshot, including committed WAL pages.
        // Never copy only the main file while a WAL may contain recent records.
        if version == 1 {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(err)?
                .as_nanos();
            let backup = path.with_extension(format!("pre-ui-b06-{stamp}.sqlite3"));
            db.execute("VACUUM INTO ?1", [path_text(&backup)?])
                .map_err(err)?;
            let verify =
                Connection::open_with_flags(&backup, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                    .map_err(err)?;
            let result: String = verify
                .pragma_query_value(None, "integrity_check", |r| r.get(0))
                .map_err(err)?;
            if result != "ok" {
                return Err("迁移备份完整性检查失败，未升级数据库。".into());
            }
        }
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS shelves(id INTEGER PRIMARY KEY, name TEXT NOT NULL,
                kind TEXT NOT NULL CHECK(kind IN ('persistent','session','bound')), root TEXT UNIQUE);
            CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, shelf_id INTEGER NOT NULL REFERENCES shelves(id),
                path TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
                UNIQUE(shelf_id,path));
            CREATE TABLE IF NOT EXISTS jobs(id INTEGER PRIMARY KEY, shelf_id INTEGER NOT NULL REFERENCES shelves(id),
                status TEXT NOT NULL, message TEXT NOT NULL, staging TEXT);").map_err(err)?;
        if version < 2 {
            db.execute_batch("ALTER TABLE shelves ADD COLUMN trashed_at INTEGER;
                ALTER TABLE items ADD COLUMN trashed_at INTEGER;
                CREATE TABLE record_ids(entity TEXT PRIMARY KEY,next_id INTEGER NOT NULL);
                INSERT INTO record_ids SELECT 'shelf',COALESCE(MAX(id),0)+1 FROM shelves;
                INSERT INTO record_ids SELECT 'item',COALESCE(MAX(id),0)+1 FROM items;
                CREATE TABLE recycle_journal(id INTEGER PRIMARY KEY,item_id INTEGER NOT NULL,path TEXT NOT NULL,status TEXT NOT NULL,message TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL DEFAULT(unixepoch()));
                CREATE TABLE recycle_layouts(shelf_id INTEGER PRIMARY KEY REFERENCES shelves(id),layout TEXT NOT NULL);
                CREATE TABLE hidden_bound_paths(shelf_id INTEGER NOT NULL REFERENCES shelves(id),path TEXT NOT NULL,PRIMARY KEY(shelf_id,path));").map_err(err)?;
        }
        if version == 0 {
            db.execute_batch("INSERT INTO shelves(id,name,kind) VALUES(1,'灵感收集','persistent'),(2,'本次中转','session'); UPDATE record_ids SET next_id=3 WHERE entity='shelf';").map_err(err)?;
        }
        db.execute_batch("UPDATE jobs SET status='interrupted',message='上次操作异常中断；已完成文件保留，残留临时文件未自动删除。' WHERE status IN ('queued','copying');
            UPDATE items SET trashed_at=unixepoch() WHERE EXISTS(SELECT 1 FROM recycle_journal j WHERE j.status='os-success' AND j.item_id=items.id AND j.path=items.path);
            UPDATE recycle_journal SET status='committed' WHERE status='os-success';
            UPDATE recycle_journal SET status='uncertain',message='上次进程在系统回收期间中断；请人工核对 Windows 回收站，不会自动再次删除。' WHERE status='pending';
            PRAGMA user_version=2; COMMIT;").map_err(err)?;
        db.execute_batch("CREATE TABLE IF NOT EXISTS chat_config(id INTEGER PRIMARY KEY CHECK(id=1),base_url TEXT NOT NULL,model TEXT NOT NULL,enabled INTEGER NOT NULL,key BLOB);
            CREATE TABLE IF NOT EXISTS chat_sessions(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS chat_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,role TEXT NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL);
            UPDATE chat_messages SET status='stopped' WHERE status='streaming';").map_err(err)?;
        Ok(Self { db })
    }
    pub fn trash_entries(&self, filter: Option<i64>) -> Result<Vec<TrashEntry>> {
        let mut rows=self.db.prepare("SELECT s.id,'shelf',s.name,s.id,s.name,s.kind,s.root,s.trashed_at,(SELECT COUNT(*) FROM items WHERE shelf_id=s.id) FROM shelves s WHERE s.trashed_at IS NOT NULL AND (?1 IS NULL OR s.id=?1)
            UNION ALL SELECT i.id,'item',i.name,s.id,s.name,s.kind,i.path,i.trashed_at,0 FROM items i JOIN shelves s ON s.id=i.shelf_id WHERE i.trashed_at IS NOT NULL AND s.trashed_at IS NULL AND (?1 IS NULL OR s.id=?1) ORDER BY 8 DESC,1 DESC").map_err(err)?;
        rows.query_map([filter], |r| {
            Ok(TrashEntry {
                id: r.get(0)?,
                entity: r.get(1)?,
                name: r.get(2)?,
                shelf_id: r.get(3)?,
                shelf_name: r.get(4)?,
                shelf_kind: r.get(5)?,
                path: r.get(6)?,
                removed_at: r.get(7)?,
                children: r.get::<_, i64>(8)? as usize,
            })
        })
        .map_err(err)?
        .collect::<std::result::Result<_, _>>()
        .map_err(err)
    }
    pub fn save_recycled_layout(&self, id: i64, layout: &str) -> Result<()> {
        self.db
            .execute(
                "INSERT OR REPLACE INTO recycle_layouts(shelf_id,layout) VALUES(?1,?2)",
                params![id, layout],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn recycled_layout(&self, id: i64) -> Result<Option<String>> {
        self.db
            .query_row(
                "SELECT layout FROM recycle_layouts WHERE shelf_id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)
    }
    pub fn recycle_activity(&self) -> Result<Vec<RecycleActivity>> {
        self.db.prepare("SELECT j.id,i.shelf_id,i.name,j.status,j.message FROM recycle_journal j JOIN items i ON i.id=j.item_id WHERE j.status NOT IN ('committed') ORDER BY j.id DESC").map_err(err)?.query_map([],|r|Ok(RecycleActivity{id:r.get(0)?,shelf_id:r.get(1)?,name:r.get(2)?,status:r.get(3)?,message:r.get(4)?})).map_err(err)?.collect::<std::result::Result<_,_>>().map_err(err)
    }
    pub fn remove_references(&mut self, ids: &[i64]) -> Result<()> {
        if ids.is_empty()
            || ids.len() > 256
            || ids.iter().collect::<std::collections::HashSet<_>>().len() != ids.len()
        {
            return Err("请选择1至256个不同引用。".into());
        }
        self.validate_item_scope(None, ids)?;
        let tx = self.db.transaction().map_err(err)?;
        for id in ids {
            tx.execute(
                "UPDATE items SET trashed_at=unixepoch() WHERE id=?1 AND trashed_at IS NULL",
                [id],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)
    }
    pub fn trash_shelf(&mut self, id: i64) -> Result<()> {
        self.shelf(id)?;
        let busy:bool=self.db.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE shelf_id=?1 AND status IN ('queued','copying'))",[id],|r|r.get(0)).map_err(err)?;
        if busy {
            return Err("文件架正在复制，请完成或取消任务后再移入回收站。".into());
        }
        self.db
            .execute(
                "UPDATE shelves SET trashed_at=unixepoch() WHERE id=?1 AND trashed_at IS NULL",
                [id],
            )
            .map_err(err)?;
        Ok(())
    }
    pub fn restore_trash(&mut self, entity: &str, id: i64) -> Result<()> {
        let sql = match entity {
            "shelf" => "UPDATE shelves SET trashed_at=NULL WHERE id=?1 AND trashed_at IS NOT NULL",
            "item" => {
                "UPDATE items SET trashed_at=NULL WHERE id=?1 AND trashed_at IS NOT NULL AND shelf_id IN (SELECT id FROM shelves WHERE trashed_at IS NULL)"
            }
            _ => return Err("未知回收记录类型。".into()),
        };
        if self.db.execute(sql, [id]).map_err(err)? != 1 {
            return Err("回收记录不存在；若所属文件架也已回收，请先恢复文件架。".into());
        }
        Ok(())
    }
    pub fn purge_trash(&mut self, entity: &str, id: i64) -> Result<()> {
        // Database rows only. This method has no filesystem deletion capability.
        let tx = self.db.transaction().map_err(err)?;
        match entity {
            "item" => {
                let shelf:i64=tx.query_row("SELECT shelf_id FROM items WHERE id=?1 AND trashed_at IS NOT NULL AND shelf_id IN (SELECT id FROM shelves WHERE trashed_at IS NULL)",[id],|r|r.get(0)).map_err(err)?;
                tx.execute("INSERT OR IGNORE INTO hidden_bound_paths(shelf_id,path) SELECT shelf_id,path FROM items WHERE id=?1 AND shelf_id IN (SELECT id FROM shelves WHERE kind='bound')",[id]).map_err(err)?;
                tx.execute("DELETE FROM recycle_journal WHERE item_id=?1", [id])
                    .map_err(err)?;
                tx.execute(
                    "DELETE FROM items WHERE id=?1 AND shelf_id=?2",
                    params![id, shelf],
                )
                .map_err(err)?;
            }
            "shelf" => {
                let exists:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM shelves WHERE id=?1 AND trashed_at IS NOT NULL)",[id],|r|r.get(0)).map_err(err)?;
                if !exists {
                    return Err("该文件架未在回收站中。".into());
                }
                tx.execute("DELETE FROM recycle_journal WHERE item_id IN (SELECT id FROM items WHERE shelf_id=?1)",[id]).map_err(err)?;
                tx.execute("DELETE FROM hidden_bound_paths WHERE shelf_id=?1", [id])
                    .map_err(err)?;
                tx.execute("DELETE FROM items WHERE shelf_id=?1", [id])
                    .map_err(err)?;
                tx.execute("DELETE FROM jobs WHERE shelf_id=?1", [id])
                    .map_err(err)?;
                tx.execute("DELETE FROM recycle_layouts WHERE shelf_id=?1", [id])
                    .map_err(err)?;
                tx.execute("DELETE FROM shelves WHERE id=?1", [id])
                    .map_err(err)?;
            }
            _ => return Err("未知回收记录类型。".into()),
        }
        tx.commit().map_err(err)
    }
    pub fn begin_recycle(&self, id: i64, expected: &Path) -> Result<i64> {
        if self.opening_target(id)? != expected {
            return Err("引用已变化，未开始系统回收。".into());
        }
        self.db
            .execute(
                "INSERT INTO recycle_journal(item_id,path,status) VALUES(?1,?2,'pending')",
                params![id, path_text(expected)?],
            )
            .map_err(err)?;
        Ok(self.db.last_insert_rowid())
    }
    pub fn recycle_result(&mut self, journal: i64, status: &str, message: &str) -> Result<()> {
        if !["os-success", "failed", "cancelled", "uncertain"].contains(&status) {
            return Err("未知回收结果。".into());
        }
        self.db
            .execute(
                "UPDATE recycle_journal SET status=?1,message=?2 WHERE id=?3 AND status='pending'",
                params![status, message, journal],
            )
            .map_err(err)?;
        if status == "os-success" {
            self.commit_recycled(journal)?;
        }
        Ok(())
    }
    fn commit_recycled(&mut self, journal: i64) -> Result<()> {
        let tx = self.db.transaction().map_err(err)?;
        tx.execute("UPDATE items SET trashed_at=unixepoch() WHERE id IN (SELECT item_id FROM recycle_journal WHERE id=?1 AND status='os-success') AND path IN (SELECT path FROM recycle_journal WHERE id=?1)",[journal]).map_err(err)?;
        tx.execute(
            "UPDATE recycle_journal SET status='committed' WHERE id=?1 AND status='os-success'",
            [journal],
        )
        .map_err(err)?;
        tx.commit().map_err(err)
    }
    pub fn integrity_check(&self) -> Result<()> {
        let value: String = self
            .db
            .pragma_query_value(None, "integrity_check", |r| r.get(0))
            .map_err(err)?;
        if value == "ok" { Ok(()) } else { Err(value) }
    }
    pub fn shelves(&self) -> Result<Vec<Shelf>> {
        let mut shelves = self.shelf_records()?;
        for shelf in &mut shelves {
            shelf.available = shelf.root.as_ref().is_none_or(|s| Path::new(s).is_dir());
        }
        Ok(shelves)
    }
    fn shelf_records(&self) -> Result<Vec<Shelf>> {
        let mut stmt = self
            .db
            .prepare("SELECT id,name,kind,root FROM shelves WHERE trashed_at IS NULL ORDER BY id")
            .map_err(err)?;
        stmt.query_map([], |r| {
            let root: Option<String> = r.get(3)?;
            let available = true;
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
    // Window hover only needs IDs/names. Never probe bound disks on native drag events.
    pub fn shelf_catalog(&self) -> Result<Vec<ShelfIdentity>> {
        self.db
            .prepare("SELECT id,name,kind FROM shelves WHERE trashed_at IS NULL ORDER BY id")
            .map_err(err)?
            .query_map([], |r| {
                Ok(ShelfIdentity {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    kind: r.get(2)?,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)
    }
    pub fn shelf(&self, id: i64) -> Result<Shelf> {
        let mut shelf = self
            .shelf_records()?
            .into_iter()
            .find(|s| s.id == id)
            .ok_or("文件架不存在。".to_string())?;
        shelf.available = shelf.root.as_ref().is_none_or(|s| Path::new(s).is_dir());
        Ok(shelf)
    }
    pub fn validate_item_scope(&self, scope: Option<i64>, ids: &[i64]) -> Result<()> {
        for id in ids {
            let shelf: i64 = self
                .db
                .query_row("SELECT shelf_id FROM items WHERE id=?1 AND trashed_at IS NULL AND shelf_id IN (SELECT id FROM shelves WHERE trashed_at IS NULL)", [id], |r| r.get(0))
                .map_err(err)?;
            if scope.is_some_and(|target| shelf != target) {
                return Err("独立窗口只能操作自己的文件架记录。".into());
            }
        }
        Ok(())
    }
    pub fn validate_job_scope(&self, scope: Option<i64>, id: i64) -> Result<()> {
        if let Some(target) = scope {
            let shelf: i64 = self
                .db
                .query_row("SELECT shelf_id FROM jobs WHERE id=?1", [id], |r| r.get(0))
                .map_err(err)?;
            if target != shelf {
                return Err("此复制任务不属于当前独立架。".into());
            }
        }
        Ok(())
    }
    pub fn create_shelf(&mut self, name: &str, session: bool) -> Result<i64> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 60 || name.chars().any(char::is_control) {
            return Err("文件架名称需为 1 至 60 个字符，不能包含控制字符。".into());
        }
        let tx = self.db.transaction().map_err(err)?;
        let exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM shelves WHERE name=?1)",
                [name],
                |r| r.get(0),
            )
            .map_err(err)?;
        if exists {
            return Err("已有同名文件架，请更换名称。".into());
        }
        let id: i64 = tx
            .query_row(
                "UPDATE record_ids SET next_id=next_id+1 WHERE entity='shelf' RETURNING next_id-1",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        tx.execute(
            "INSERT INTO shelves(name,kind,id) VALUES(?1,?2,?3)",
            params![name, if session { "session" } else { "persistent" }, id],
        )
        .map_err(err)?;
        let id = tx.last_insert_rowid();
        tx.commit().map_err(err)?;
        Ok(id)
    }
    pub fn copy_references(&mut self, target: i64, ids: &[i64]) -> Result<usize> {
        if self
            .shelf_catalog()?
            .into_iter()
            .find(|s| s.id == target)
            .ok_or("目标文件架不存在")?
            .kind
            == "bound"
        {
            return Err("真实目录请使用安全复制文件，不能仅复制引用。".into());
        }
        if ids.is_empty()
            || ids.len() > 256
            || ids.iter().collect::<std::collections::HashSet<_>>().len() != ids.len()
        {
            return Err("请选择 1 至 256 个不同引用。".into());
        }
        let tx = self.db.transaction().map_err(err)?;
        let mut added = 0;
        for id in ids {
            let (path, name, tags): (String, String, String) = tx
                .query_row("SELECT path,name,tags FROM items WHERE id=?1 AND trashed_at IS NULL AND shelf_id IN (SELECT id FROM shelves WHERE trashed_at IS NULL)", [id], |r| {
                    Ok((r.get(0)?, r.get(1)?, r.get(2)?))
                })
                .map_err(err)?;
            let existing: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM items WHERE shelf_id=?1 AND path=?2)",
                    params![target, &path],
                    |r| r.get(0),
                )
                .map_err(err)?;
            if existing {
                continue;
            }
            let new_id:i64=tx.query_row("UPDATE record_ids SET next_id=next_id+1 WHERE entity='item' RETURNING next_id-1",[],|r|r.get(0)).map_err(err)?;
            added+=tx.execute("INSERT INTO items(shelf_id,path,name,position,tags,id) VALUES(?1,?2,?3,COALESCE((SELECT MAX(position)+1 FROM items WHERE shelf_id=?1),0),?4,?5)",params![target,path,name,tags,new_id]).map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(added)
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
        if let Some((id, trashed)) = self
            .db
            .query_row(
                "SELECT id,trashed_at IS NOT NULL FROM shelves WHERE root=?1",
                [&value],
                |r| Ok((r.get::<_, i64>(0)?, r.get::<_, bool>(1)?)),
            )
            .optional()
            .map_err(err)?
        {
            return if trashed {
                Err("该目录架在柠猫回收站中，请先恢复。".into())
            } else {
                Ok(id)
            };
        }
        let id: i64 = self
            .db
            .query_row(
                "UPDATE record_ids SET next_id=next_id+1 WHERE entity='shelf' RETURNING next_id-1",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        self.db
            .execute(
                "INSERT INTO shelves(name,kind,root,id) VALUES(?1,'bound',?2,?3)",
                params![name, value, id],
            )
            .map_err(err)?;
        self.db
            .query_row(
                "SELECT id FROM shelves WHERE root=?1 AND trashed_at IS NULL",
                [value],
                |r| r.get(0),
            )
            .map_err(err)
    }
    fn insert(&self, shelf: i64, path: &Path) -> Result<i64> {
        let value = path_text(path)?;
        let name = path
            .file_name()
            .ok_or("路径没有文件名。")?
            .to_str()
            .ok_or("文件名不是有效 Unicode。")?;
        if let Some(id) = self
            .db
            .query_row(
                "SELECT id FROM items WHERE shelf_id=?1 AND path=?2",
                params![shelf, &value],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?
        {
            return Ok(id);
        }
        let id: i64 = self
            .db
            .query_row(
                "UPDATE record_ids SET next_id=next_id+1 WHERE entity='item' RETURNING next_id-1",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        self.db
            .execute(
                "INSERT INTO items(shelf_id,path,name,position,id)
            VALUES(?1,?2,?3,COALESCE((SELECT MAX(position)+1 FROM items WHERE shelf_id=?1),0),?4)",
                params![shelf, value, name, id],
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
        let path = canonical_user_path(path)?;
        let hidden:bool=self.db.query_row("SELECT EXISTS(SELECT 1 FROM items WHERE shelf_id=?1 AND path=?2 AND trashed_at IS NOT NULL)",params![shelf,path_text(&path)?],|r|r.get(0)).map_err(err)?;
        if hidden {
            return Err("该引用在软件回收站中，请先恢复。".into());
        }
        self.insert(shelf, &path)
    }
    pub fn record_copy(&mut self, shelf: i64, path: &Path) -> Result<i64> {
        let root = self.shelf(shelf)?.root.ok_or("没有绑定目录。")?;
        if path.parent() != Some(Path::new(&root)) {
            return Err("目标超出绑定目录。".into());
        }
        self.insert(shelf, path)
    }
    pub fn relocation_source(&self, id: i64) -> Result<PathBuf> {
        let (path, _kind): (String, String) = self
            .db
            .query_row(
                "SELECT i.path,s.kind FROM items i JOIN shelves s ON s.id=i.shelf_id WHERE i.id=?1 AND i.trashed_at IS NULL AND s.trashed_at IS NULL",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(err)?
            .ok_or("文件记录不存在，请刷新后重试。")?;
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
        let root: Option<String> = self
            .db
            .query_row(
                "SELECT s.root FROM shelves s JOIN items i ON i.shelf_id=s.id WHERE i.id=?1",
                [id],
                |r| r.get(0),
            )
            .map_err(err)?;
        if let Some(root) = root {
            let root = canonical_user_path(Path::new(&root))?;
            if replacement.parent() != Some(root.as_path()) {
                return Err(
                    "绑定架只能重新定位到同一绑定目录的直接子项；目录绑定保持不变。".into(),
                );
            }
        }

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
        self.validate_item_scope(None, &[id])?;
        self.db
            .execute(
                "UPDATE items SET trashed_at=unixepoch() WHERE id=?1 AND trashed_at IS NULL",
                [id],
            )
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
                "UPDATE items SET tags=?1 WHERE id=?2 AND trashed_at IS NULL AND shelf_id IN (SELECT id FROM shelves WHERE trashed_at IS NULL)",
                params![serde_json::to_string(&tags).map_err(err)?, id],
            )
            .map_err(err)?
            == 0
        {
            return Err("文件记录不存在。".into());
        }
        Ok(())
    }
    pub fn tag_references(&mut self, ids: &[i64], tag: &str, remove: bool) -> Result<usize> {
        let tag = tag.trim();
        if tag.is_empty() || tag.len() > 128 || tag.chars().any(char::is_control) {
            return Err("标签需为1至128字节，不能包含控制字符。".into());
        }
        if ids.is_empty()
            || ids.len() > 256
            || ids.iter().collect::<std::collections::HashSet<_>>().len() != ids.len()
        {
            return Err("请选择1至256个不同引用；不会只更新部分选中项。".into());
        }
        let tx = self.db.transaction().map_err(err)?;
        for id in ids {
            let raw: String = tx
                .query_row("SELECT tags FROM items WHERE id=?1 AND trashed_at IS NULL AND shelf_id IN (SELECT id FROM shelves WHERE trashed_at IS NULL)", [id], |r| r.get(0))
                .map_err(err)?;
            let mut tags: Vec<String> = serde_json::from_str(&raw).map_err(err)?;
            if remove {
                tags.retain(|value| value != tag);
            } else if !tags.iter().any(|value| value == tag) {
                tags.push(tag.into());
            }
            if tags.len() > 32 {
                return Err("单个文件最多32个标签，本次批量修改已取消。".into());
            }
            tx.execute(
                "UPDATE items SET tags=?1 WHERE id=?2 AND trashed_at IS NULL AND shelf_id IN (SELECT id FROM shelves WHERE trashed_at IS NULL)",
                params![serde_json::to_string(&tags).map_err(err)?, id],
            )
            .map_err(err)?;
        }
        tx.commit().map_err(err)?;
        Ok(ids.len())
    }
    // Read registered rows only. No paths in DTO and never enumerate a bound directory.
    pub fn entry_preview(&self, shelf_id: i64) -> Result<EntryPreview> {
        let shelf = self
            .shelf_catalog()?
            .into_iter()
            .find(|s| s.id == shelf_id)
            .ok_or("文件架不存在")?;
        let total = self
            .db
            .query_row(
                "SELECT COUNT(*) FROM items WHERE shelf_id=?1 AND trashed_at IS NULL",
                [shelf_id],
                |r| r.get::<_, i64>(0),
            )
            .map_err(err)? as usize;
        let items = self
            .db
            .prepare("SELECT id,name FROM items WHERE shelf_id=?1 AND trashed_at IS NULL ORDER BY id DESC LIMIT 3")
            .map_err(err)?
            .query_map([shelf_id], |r| {
                Ok(PeekItem {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    kind: "file".into(),
                    status: "recorded".into(),
                    thumbnail: None,
                })
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(EntryPreview {
            shelf,
            total,
            items,
        })
    }
    // Metadata only: no stat/read_dir/canonicalize and no insertion into bound shelves.
    pub fn management_snapshot(&self) -> Result<ManagementSnapshot> {
        let items = self
            .db
            .prepare("SELECT id,shelf_id,path,name,tags FROM items WHERE trashed_at IS NULL AND shelf_id IN (SELECT id FROM shelves WHERE trashed_at IS NULL) ORDER BY shelf_id,position,id")
            .map_err(err)?
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
            .map_err(err)?
            .into_iter()
            .map(|(id, shelf_id, path, name, raw)| {
                let kind = Path::new(&path)
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("file")
                    .to_lowercase();
                Ok(ManagedReference {
                    id,
                    shelf_id,
                    path,
                    name,
                    kind,
                    tags: serde_json::from_str(&raw).map_err(err)?,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(ManagementSnapshot {
            shelves: self.shelf_catalog()?,
            items,
            jobs: self.jobs()?,
        })
    }
    fn jobs(&self) -> Result<Vec<Job>> {
        self.jobs_scoped(None)
    }
    fn jobs_scoped(&self, scope: Option<i64>) -> Result<Vec<Job>> {
        self.db
            .prepare(
                "SELECT id,shelf_id,status,message,staging FROM jobs WHERE (?1 IS NULL OR shelf_id=?1) ORDER BY id DESC LIMIT 20",
            )
            .map_err(err)?
            .query_map([scope], |r| {
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
            .map_err(err)
    }
    pub fn reorder(&mut self, shelf: i64, ids: &[i64]) -> Result<()> {
        let expected: Vec<i64> = self
            .db
            .prepare("SELECT id FROM items WHERE shelf_id=?1 AND trashed_at IS NULL ORDER BY id")
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
        self.snapshot_scoped(None, &[])
    }
    pub fn snapshot_scoped(&mut self, scope: Option<i64>, excluded: &[i64]) -> Result<Snapshot> {
        let mut shelves: Vec<_> = self
            .shelf_records()?
            .into_iter()
            .filter(|s| scope.map_or(!excluded.contains(&s.id), |id| s.id == id))
            .collect();
        for shelf in &mut shelves {
            shelf.available = shelf.root.as_ref().is_none_or(|s| Path::new(s).is_dir());
        }
        let allowed: std::collections::HashSet<i64> = shelves.iter().map(|s| s.id).collect();
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
                        let hidden:bool=self.db.query_row("SELECT EXISTS(SELECT 1 FROM hidden_bound_paths WHERE shelf_id=?1 AND path=?2)",params![shelf.id,path_text(&path)?],|r|r.get(0)).map_err(err)?;
                        if !hidden {
                            self.insert(shelf.id, &path)?;
                        }
                    }
                }
            }
        }
        let mut stmt = self
            .db
            .prepare("SELECT id,shelf_id,path,name,tags FROM items WHERE trashed_at IS NULL AND shelf_id IN (SELECT id FROM shelves WHERE trashed_at IS NULL) ORDER BY shelf_id,position,id")
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
            .filter(|(_, id, _, _, _)| allowed.contains(id))
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
        let jobs = self.jobs_scoped(scope)?;
        Ok(Snapshot {
            shelves,
            items,
            jobs,
        })
    }
    pub fn item_path(&self, id: i64) -> Result<PathBuf> {
        self.db
            .query_row("SELECT path FROM items WHERE id=?1 AND trashed_at IS NULL AND shelf_id IN (SELECT id FROM shelves WHERE trashed_at IS NULL)", [id], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .map_err(err)?
            .map(PathBuf::from)
            .ok_or("文件记录不存在。".into())
    }
    /// Resolve only an existing registered local file/directory, never a frontend URL or command.
    pub fn opening_target(&self, id: i64) -> Result<PathBuf> {
        canonical_user_path(&self.item_path(id)?)
    }
    pub fn validate_opening_target(&self, id: i64, expected: &Path) -> Result<()> {
        if self.opening_target(id)? != expected {
            return Err("文件引用已更改，请重新选择后打开。".into());
        }
        Ok(())
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
    pub fn finish_transfer_job(
        &mut self,
        id: i64,
        shelf: i64,
        status: &str,
        message: &str,
    ) -> Result<()> {
        let changed = self
            .db
            .execute(
                "UPDATE jobs SET status=?1,message=?2 WHERE id=?3 AND shelf_id=?4 AND status IN ('queued','copying')",
                params![status, message, id, shelf],
            )
            .map_err(err)?;
        if changed != 1 {
            return Err("传输任务记录已不存在或结束，请核对接收目录。".into());
        }
        Ok(())
    }
    pub fn clean_exit(&mut self) -> Result<()> {
        let tx = self.db.transaction().map_err(err)?;
        tx.execute(
            "DELETE FROM items WHERE trashed_at IS NULL AND shelf_id IN (SELECT id FROM shelves WHERE kind='session' AND trashed_at IS NULL) AND id NOT IN (SELECT item_id FROM recycle_journal WHERE status IN ('pending','uncertain','os-success'))",
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
/// A warning for common active content; file extensions cannot establish content safety.
pub fn needs_open_confirmation(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|v| v.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "exe"
            | "com"
            | "bat"
            | "cmd"
            | "ps1"
            | "psm1"
            | "vbs"
            | "vbe"
            | "js"
            | "jse"
            | "wsf"
            | "wsh"
            | "hta"
            | "scr"
            | "pif"
            | "lnk"
            | "url"
            | "msi"
            | "msp"
            | "reg"
            | "cpl"
            | "msc"
            | "appref-ms"
    )
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
