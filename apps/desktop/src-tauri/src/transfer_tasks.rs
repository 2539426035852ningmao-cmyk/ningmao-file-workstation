//! Rust-only adapter. No IPC, listener or arbitrary-path permission is added.
use crate::store::{Result, Store};
use ningmao_transfer_contract::{Phase, TaskEvent};
use std::collections::HashMap;

#[derive(Default)]
pub struct TransferTasks {
    tasks: HashMap<String, (i64, i64, TaskEvent)>,
}
impl TransferTasks {
    /// `shelf` is chosen by the trusted caller, never taken from a peer event.
    /// Returns the existing job ID; duplicate events are idempotent.
    pub fn apply(
        &mut self,
        store: &mut Store,
        shelf: i64,
        event: &TaskEvent,
    ) -> Result<Option<i64>> {
        use Phase::*;
        if event.version != 1
            || event.task.len() != 36
            || !event.task.bytes().enumerate().all(|(i, b)| {
                if [8, 13, 18, 23].contains(&i) {
                    b == b'-'
                } else {
                    b.is_ascii_hexdigit()
                }
            })
            || event.sequence == 0
            || !(1..=16).contains(&event.files)
            || event.completed > event.files
            || event.total > 16 * 512 * 1024 * 1024
            || event.bytes > event.total
            || (event.phase == Completed
                && (event.completed != event.files || event.bytes != event.total))
            || (event.phase == Partial && (event.completed == 0 || event.completed == event.files))
            || (event.phase == Failed && event.completed != 0)
        {
            return Err("无效的传输任务事件；没有修改任务。".into());
        }
        let id = if let Some((id, owner, previous)) = self.tasks.get(&event.task) {
            if *owner != shelf {
                return Err("传输任务不属于当前文件架。".into());
            }
            if event.sequence < previous.sequence || event == previous {
                return Ok(None);
            }
            if event.sequence == previous.sequence {
                return Err("相同序号的传输事件不一致。".into());
            }
            if previous.phase.terminal()
                || (event.phase == Completed && previous.phase != Verifying)
                || event.phase == Queued
                || event.files != previous.files
                || event.total != previous.total
                || event.bytes < previous.bytes
                || event.completed < previous.completed
                || (previous.phase == Cancelling && !matches!(event.phase, Cancelling | Cancelled))
            {
                return Err("传输任务状态转换无效；保留现有记录。".into());
            }
            *id
        } else {
            // ponytail: bound in-memory correlation to 64 tasks per worker lifecycle.
            // A future persistent transport supervisor must reconcile journal+published files first.
            if self.tasks.len() >= 64
                || event.sequence != 1
                || event.phase != Queued
                || event.bytes != 0
                || event.completed != 0
            {
                return Err("传输任务必须从新的等待事件开始。".into());
            }
            let id = store.begin_job(shelf, "接收文件：等待传输")?;
            self.tasks
                .insert(event.task.clone(), (id, shelf, event.clone()));
            return Ok(Some(id));
        };
        let (status, label) = match event.phase {
            Queued => ("queued", "等待传输"),
            Receiving => ("copying", "接收中"),
            Verifying => ("copying", "校验中"),
            Cancelling => ("copying", "取消中，等待安全清理"),
            Completed => ("completed", "接收完成"),
            Partial => ("partial", "部分完成，已完成文件保留"),
            Failed => ("failed", "接收失败，来源和已存在文件保留"),
            Cancelled => ("cancelled", "已取消，已完成文件保留"),
        };
        store.finish_job(
            id,
            status,
            &format!(
                "接收文件：{label} · {}/{} 项 · {}/{} B",
                event.completed, event.files, event.bytes, event.total
            ),
        )?;
        self.tasks
            .insert(event.task.clone(), (id, shelf, event.clone()));
        Ok(Some(id))
    }
}
