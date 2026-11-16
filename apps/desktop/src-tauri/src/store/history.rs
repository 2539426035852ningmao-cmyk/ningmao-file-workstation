//! Transactional metadata history. No filesystem or job mutation capability.
use super::{Result, Store, err};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

#[derive(Serialize)]
pub struct HistoryState {
    pub capacity: i64,
    pub undo: Option<String>,
    pub redo: Option<String>,
}
#[derive(Serialize)]
pub struct HistoryApplied {
    pub shelf_id: i64,
    pub label: String,
}

fn columns(entity: &str) -> Result<(&'static str, &'static [&'static str])> {
    match entity {
        "shelf" => Ok(("shelves", &["id", "name", "kind", "root", "trashed_at"])),
        "item" => Ok((
            "items",
            &[
                "id",
                "shelf_id",
                "path",
                "name",
                "position",
                "tags",
                "trashed_at",
            ],
        )),
        _ => Err("未知整理记录类型".into()),
    }
}
fn json_row(prefix: &str, fields: &[&str]) -> String {
    format!(
        "json_object({})",
        fields
            .iter()
            .map(|field| format!("'{field}',{prefix}.{field}"))
            .collect::<Vec<_>>()
            .join(",")
    )
}
pub(super) fn install(db: &Connection) -> Result<()> {
    db.execute_batch("SAVEPOINT install_organize_history; CREATE TABLE IF NOT EXISTS history_settings(id INTEGER PRIMARY KEY CHECK(id=1),capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 1000));
      INSERT OR IGNORE INTO history_settings VALUES(1,100);
      CREATE TABLE IF NOT EXISTS history_steps(id INTEGER PRIMARY KEY AUTOINCREMENT,label TEXT NOT NULL,shelf_id INTEGER NOT NULL,applied INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS history_changes(id INTEGER PRIMARY KEY AUTOINCREMENT,step INTEGER NOT NULL REFERENCES history_steps(id) ON DELETE CASCADE,entity TEXT NOT NULL,row_id INTEGER NOT NULL,before_value TEXT,after_value TEXT,UNIQUE(step,entity,row_id));
      CREATE TABLE IF NOT EXISTS history_context(id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL,step INTEGER);
      INSERT OR IGNORE INTO history_context VALUES(1,'idle',NULL);
      CREATE INDEX IF NOT EXISTS history_changed_rows ON history_changes(entity,row_id,step);
      CREATE INDEX IF NOT EXISTS history_applied ON history_steps(applied,id);").map_err(err)?;
    for entity in ["shelf", "item"] {
        let (table, fields) = columns(entity)?;
        for (event, old, new, id) in [
            ("INSERT", "NULL", json_row("NEW", fields), "NEW.id"),
            ("UPDATE", "old", json_row("NEW", fields), "NEW.id"),
            ("DELETE", "old", "NULL".into(), "OLD.id"),
        ] {
            let before = if old == "old" {
                json_row("OLD", fields)
            } else {
                old.into()
            };
            let changed = if event == "UPDATE" {
                format!(" AND ({before} IS NOT {new})")
            } else {
                String::new()
            };
            db.execute_batch(&format!("CREATE TRIGGER IF NOT EXISTS history_{entity}_{event}_record AFTER {event} ON {table}
              WHEN (SELECT mode FROM history_context WHERE id=1)='record'{changed}
              BEGIN INSERT INTO history_changes(step,entity,row_id,before_value,after_value) VALUES((SELECT step FROM history_context WHERE id=1),'{entity}',{id},{before},{new})
              ON CONFLICT(step,entity,row_id) DO UPDATE SET after_value=excluded.after_value; END;")).map_err(err)?;
            if event != "INSERT" {
                // External/non-undoable changes invalidate whole affected steps, never replay stale values.
                db.execute_batch(&format!("CREATE TRIGGER IF NOT EXISTS history_{entity}_{event}_invalidate AFTER {event} ON {table}
                  WHEN (SELECT mode FROM history_context WHERE id=1)='idle'{changed}
                  BEGIN DELETE FROM history_steps WHERE id IN(SELECT step FROM history_changes WHERE entity='{entity}' AND row_id={id}); END;")).map_err(err)?;
            }
        }
    }
    db.execute_batch("RELEASE install_organize_history")
        .map_err(err)?;
    Ok(())
}

impl Store {
    pub fn record_history<T>(
        &mut self,
        label: &str,
        shelf_id: i64,
        action: impl FnOnce(&mut Self) -> Result<T>,
    ) -> Result<T> {
        let mode: String = self
            .db
            .query_row("SELECT mode FROM history_context WHERE id=1", [], |r| {
                r.get(0)
            })
            .map_err(err)?;
        if mode != "idle" {
            return action(self);
        }
        self.db
            .execute_batch("SAVEPOINT organize_command")
            .map_err(err)?;
        let result = (|| {
            self.db
                .execute(
                    "INSERT INTO history_steps(label,shelf_id) VALUES(?1,?2)",
                    params![label, shelf_id],
                )
                .map_err(err)?;
            let step = self.db.last_insert_rowid();
            self.db
                .execute(
                    "UPDATE history_context SET mode='record',step=?1 WHERE id=1",
                    [step],
                )
                .map_err(err)?;
            let value = action(self)?;
            self.db
                .execute_batch("UPDATE history_context SET mode='idle',step=NULL WHERE id=1")
                .map_err(err)?;
            self.db
                .execute(
                    "DELETE FROM history_changes WHERE step=?1 AND before_value IS after_value",
                    [step],
                )
                .map_err(err)?;
            let changed: bool = self
                .db
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM history_changes WHERE step=?1)",
                    [step],
                    |r| r.get(0),
                )
                .map_err(err)?;
            if changed {
                self.db
                    .execute("DELETE FROM history_steps WHERE applied=0", [])
                    .map_err(err)?;
                if shelf_id == 0 {
                    self.db.execute("UPDATE history_steps SET shelf_id=COALESCE((SELECT CASE WHEN entity='shelf' THEN row_id ELSE json_extract(COALESCE(after_value,before_value),'$.shelf_id') END FROM history_changes WHERE step=?1 ORDER BY id LIMIT 1),0) WHERE id=?1",[step]).map_err(err)?;
                }
                self.trim_history()?;
            } else {
                self.db
                    .execute("DELETE FROM history_steps WHERE id=?1", [step])
                    .map_err(err)?;
            }
            Ok(value)
        })();
        match result {
            Ok(value) => {
                self.db
                    .execute_batch("RELEASE organize_command")
                    .map_err(err)?;
                Ok(value)
            }
            Err(error) => {
                self.db
                    .execute_batch("ROLLBACK TO organize_command; RELEASE organize_command")
                    .map_err(err)?;
                Err(error)
            }
        }
    }
    fn trim_history(&self) -> Result<()> {
        self.db.execute("DELETE FROM history_steps WHERE id NOT IN(SELECT id FROM history_steps ORDER BY id DESC LIMIT (SELECT capacity FROM history_settings WHERE id=1))",[]).map_err(err)?;
        Ok(())
    }
    pub fn history_state(&self) -> Result<HistoryState> {
        Ok(HistoryState {
            capacity: self
                .db
                .query_row(
                    "SELECT capacity FROM history_settings WHERE id=1",
                    [],
                    |r| r.get(0),
                )
                .map_err(err)?,
            undo: self
                .db
                .query_row(
                    "SELECT label FROM history_steps WHERE applied=1 ORDER BY id DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .optional()
                .map_err(err)?,
            redo: self
                .db
                .query_row(
                    "SELECT label FROM history_steps WHERE applied=0 ORDER BY id LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .optional()
                .map_err(err)?,
        })
    }
    pub fn history_capacity(&mut self, capacity: i64) -> Result<HistoryState> {
        if !(1..=1000).contains(&capacity) {
            return Err("历史容量需为1至1000步".into());
        }
        let tx = self.db.savepoint().map_err(err)?;
        tx.execute(
            "UPDATE history_settings SET capacity=?1 WHERE id=1",
            [capacity],
        )
        .map_err(err)?;
        tx.execute("DELETE FROM history_steps WHERE id NOT IN(SELECT id FROM history_steps ORDER BY id DESC LIMIT ?1)",[capacity]).map_err(err)?;
        tx.commit().map_err(err)?;
        self.history_state()
    }
    pub fn history_apply(&mut self, redo: bool) -> Result<HistoryApplied> {
        let tx = self.db.savepoint().map_err(err)?;
        let sql = if redo {
            "SELECT id,shelf_id,label FROM history_steps WHERE applied=0 ORDER BY id LIMIT 1"
        } else {
            "SELECT id,shelf_id,label FROM history_steps WHERE applied=1 ORDER BY id DESC LIMIT 1"
        };
        let (step, shelf_id, label): (i64, i64, String) = tx
            .query_row(sql, [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .optional()
            .map_err(err)?
            .ok_or("没有可恢复的整理操作")?;
        let sql = if redo {
            "SELECT entity,row_id,before_value,after_value FROM history_changes WHERE step=?1 ORDER BY id"
        } else {
            "SELECT entity,row_id,after_value,before_value FROM history_changes WHERE step=?1 ORDER BY id DESC"
        };
        let changes = tx
            .prepare(sql)
            .map_err(err)?
            .query_map([step], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                ))
            })
            .map_err(err)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(err)?;
        tx.execute_batch("UPDATE history_context SET mode='replay' WHERE id=1")
            .map_err(err)?;
        for (entity, id, expected, target) in changes {
            let (table, fields) = columns(&entity)?;
            let current: Option<String> = tx
                .query_row(
                    &format!(
                        "SELECT {} FROM {table} AS r WHERE id=?1",
                        json_row("r", fields)
                    ),
                    [id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(err)?;
            if current != expected {
                return Err("整理对象已变化，未覆盖当前记录".into());
            }
            let target = if !redo && target.is_none() && expected.is_some() {
                // Undo creation archives the metadata, preserving job references and recovery IDs.
                if entity == "shelf" {
                    let busy:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE shelf_id=?1 AND status IN ('queued','copying'))",[id],|r|r.get(0)).map_err(err)?;
                    if busy {
                        return Err("文件架正在复制，请完成或取消任务后再撤销".into());
                    }
                }
                tx.execute(
                    &format!("UPDATE {table} SET trashed_at=unixepoch() WHERE id=?1"),
                    [id],
                )
                .map_err(err)?;
                let archived: String = tx
                    .query_row(
                        &format!(
                            "SELECT {} FROM {table} AS r WHERE id=?1",
                            json_row("r", fields)
                        ),
                        [id],
                        |r| r.get(0),
                    )
                    .map_err(err)?;
                tx.execute("UPDATE history_changes SET before_value=?1 WHERE step=?2 AND entity=?3 AND row_id=?4",params![archived,step,entity,id]).map_err(err)?;
                Some(archived)
            } else {
                target
            };
            if let Some(raw) = target {
                let data: serde_json::Value = serde_json::from_str(&raw).map_err(err)?;
                if entity == "shelf" && !data["trashed_at"].is_null() {
                    let busy:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE shelf_id=?1 AND status IN ('queued','copying'))",[id],|r|r.get(0)).map_err(err)?;
                    if busy {
                        return Err("文件架正在复制，请完成或取消任务后再恢复这一步".into());
                    }
                }
                if data["id"].as_i64() != Some(id) {
                    return Err("整理记录无效，未修改数据".into());
                }
                let values = fields
                    .iter()
                    .map(|key| match &data[*key] {
                        serde_json::Value::Null => Ok(rusqlite::types::Value::Null),
                        serde_json::Value::String(s) => Ok(rusqlite::types::Value::Text(s.clone())),
                        serde_json::Value::Number(n) => n
                            .as_i64()
                            .map(rusqlite::types::Value::Integer)
                            .ok_or("整理记录数值无效"),
                        _ => Err("整理记录字段无效"),
                    })
                    .collect::<std::result::Result<Vec<_>, _>>()?;
                let updates = fields
                    .iter()
                    .skip(1)
                    .map(|f| format!("{f}=excluded.{f}"))
                    .collect::<Vec<_>>()
                    .join(",");
                tx.execute(&format!("INSERT INTO {table}({}) VALUES({}) ON CONFLICT(id) DO UPDATE SET {updates}",fields.join(","),vec!["?";fields.len()].join(",")),rusqlite::params_from_iter(values)).map_err(err)?;
            } else {
                if entity == "shelf" {
                    tx.execute("DELETE FROM recycle_layouts WHERE shelf_id=?1", [id])
                        .map_err(err)?;
                    tx.execute("DELETE FROM hidden_bound_paths WHERE shelf_id=?1", [id])
                        .map_err(err)?;
                }
                tx.execute(&format!("DELETE FROM {table} WHERE id=?1"), [id])
                    .map_err(err)?;
            }
        }
        tx.execute(
            "UPDATE history_steps SET applied=?1 WHERE id=?2",
            params![i64::from(redo), step],
        )
        .map_err(err)?;
        tx.execute_batch("UPDATE history_context SET mode='idle',step=NULL WHERE id=1")
            .map_err(err)?;
        tx.commit().map_err(err)?;
        Ok(HistoryApplied { shelf_id, label })
    }
}
