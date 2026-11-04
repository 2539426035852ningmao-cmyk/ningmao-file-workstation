use super::{Result, Store, err};
use rusqlite::{OptionalExtension, params};
use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct ChatConfig {
    pub base_url: String,
    pub model: String,
    pub enabled: bool,
    pub has_key: bool,
}
#[derive(Serialize)]
pub struct ChatSession {
    pub id: i64,
    pub title: String,
}
#[derive(Serialize)]
pub struct ChatMessage {
    pub id: i64,
    pub role: String,
    pub content: String,
    pub status: String,
}
#[derive(Serialize)]
pub struct PromptMessage {
    pub role: String,
    pub content: String,
}
pub struct ChatRequest {
    pub assistant_id: i64,
    pub messages: Vec<PromptMessage>,
}

impl Store {
    pub fn chat_config(&self) -> Result<ChatConfig> {
        Ok(self
            .db
            .query_row(
                "SELECT base_url,model,enabled,key IS NOT NULL FROM chat_config WHERE id=1",
                [],
                |r| {
                    Ok(ChatConfig {
                        base_url: r.get(0)?,
                        model: r.get(1)?,
                        enabled: r.get(2)?,
                        has_key: r.get(3)?,
                    })
                },
            )
            .optional()
            .map_err(err)?
            .unwrap_or(ChatConfig {
                base_url: String::new(),
                model: String::new(),
                enabled: false,
                has_key: false,
            }))
    }
    pub fn chat_configure(
        &self,
        base_url: &str,
        model: &str,
        enabled: bool,
        encrypted_key: Option<&[u8]>,
    ) -> Result<ChatConfig> {
        if base_url.len() > 2048 || model.len() > 200 || model.chars().any(char::is_control) {
            return Err("模型配置无效".into());
        }
        if enabled && model.trim().is_empty() {
            return Err("请填写模型名称".into());
        }
        let old: Option<Vec<u8>> = self
            .db
            .query_row(
                "SELECT key FROM chat_config WHERE id=1 AND base_url=?1",
                [base_url],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?
            .flatten();
        let key = match encrypted_key {
            None => old,
            Some([]) => None,
            Some(value) => Some(value.to_vec()),
        };
        self.db.execute("INSERT INTO chat_config(id,base_url,model,enabled,key) VALUES(1,?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET base_url=excluded.base_url,model=excluded.model,enabled=excluded.enabled,key=excluded.key", params![base_url,model.trim(),enabled,key]).map_err(err)?;
        self.chat_config()
    }
    pub fn chat_key_ciphertext(&self) -> Result<Option<Vec<u8>>> {
        let bytes: Option<Vec<u8>> = self
            .db
            .query_row("SELECT key FROM chat_config WHERE id=1", [], |r| r.get(0))
            .optional()
            .map_err(err)?
            .flatten();
        Ok(bytes)
    }
    pub fn chat_new(&self) -> Result<i64> {
        self.db
            .execute("INSERT INTO chat_sessions(title) VALUES('新对话')", [])
            .map_err(err)?;
        Ok(self.db.last_insert_rowid())
    }
    pub fn chat_sessions(&self) -> Result<Vec<ChatSession>> {
        self.db
            .prepare("SELECT id,title FROM chat_sessions ORDER BY id DESC LIMIT 100")
            .map_err(err)?
            .query_map([], |r| {
                Ok(ChatSession {
                    id: r.get(0)?,
                    title: r.get(1)?,
                })
            })
            .map_err(err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(err)
    }
    pub fn chat_messages(&self, session: i64) -> Result<Vec<ChatMessage>> {
        self.db
            .prepare(
                "SELECT id,role,content,status FROM chat_messages WHERE session_id=?1 ORDER BY id",
            )
            .map_err(err)?
            .query_map([session], |r| {
                Ok(ChatMessage {
                    id: r.get(0)?,
                    role: r.get(1)?,
                    content: r.get(2)?,
                    status: r.get(3)?,
                })
            })
            .map_err(err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(err)
    }
    pub fn chat_delete(&self, session: i64) -> Result<()> {
        self.db
            .execute("DELETE FROM chat_sessions WHERE id=?1", [session])
            .map_err(err)?;
        Ok(())
    }
    pub fn chat_begin(&mut self, session: i64, text: &str) -> Result<ChatRequest> {
        let text = text.trim();
        if text.is_empty() || text.len() > 16000 {
            return Err("请输入不超过 16000 字节的文字".into());
        }
        let tx = self.db.transaction().map_err(err)?;
        let exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM chat_sessions WHERE id=?1)",
                [session],
                |r| r.get(0),
            )
            .map_err(err)?;
        if !exists {
            return Err("对话不存在".into());
        }
        let count: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM chat_messages WHERE session_id=?1",
                [session],
                |r| r.get(0),
            )
            .map_err(err)?;
        if count >= 200 {
            return Err("此对话已达 100 轮，请新建对话".into());
        }
        tx.execute("INSERT INTO chat_messages(session_id,role,content,status) VALUES(?1,'user',?2,'completed')",params![session,text]).map_err(err)?;
        if count == 0 {
            tx.execute(
                "UPDATE chat_sessions SET title=?1 WHERE id=?2",
                params![text.chars().take(30).collect::<String>(), session],
            )
            .map_err(err)?;
        }
        let history = {
            let mut statement=tx.prepare("SELECT role,content FROM chat_messages WHERE session_id=?1 AND status='completed' ORDER BY id DESC LIMIT 21").map_err(err)?;
            let rows = statement
                .query_map([session], |r| {
                    Ok(PromptMessage {
                        role: r.get(0)?,
                        content: r.get(1)?,
                    })
                })
                .map_err(err)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(err)?;
            let mut bounded = Vec::new();
            let mut bytes = 0;
            for message in rows {
                if bytes + message.content.len() > 64000 {
                    break;
                }
                bytes += message.content.len();
                bounded.push(message);
            }
            bounded.reverse();
            while bounded
                .first()
                .is_some_and(|message| message.role != "user")
            {
                bounded.remove(0);
            }
            bounded
        };
        tx.execute("INSERT INTO chat_messages(session_id,role,content,status) VALUES(?1,'assistant','','streaming')",[session]).map_err(err)?;
        let assistant_id = tx.last_insert_rowid();
        tx.commit().map_err(err)?;
        Ok(ChatRequest {
            assistant_id,
            messages: history,
        })
    }
    pub fn chat_finish(&self, message: i64, text: &str, status: &str) -> Result<()> {
        self.db
            .execute(
                "UPDATE chat_messages SET content=?1,status=?2 WHERE id=?3",
                params![text, status, message],
            )
            .map_err(err)?;
        Ok(())
    }
}
