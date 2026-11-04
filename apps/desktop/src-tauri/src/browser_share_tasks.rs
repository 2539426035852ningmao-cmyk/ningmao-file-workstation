//! Trusted local sender events -> existing task Store. No IPC or network entry point.
use crate::store::{Result, Store};
use serde::Deserialize;

#[derive(Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
enum Phase {
    Queued,
    Waiting,
    Verified,
    Failed,
    Cancelled,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Event {
    version: u8,
    phase: Phase,
    files: u32,
    total: u64,
}

#[derive(Default)]
pub struct BrowserShareTask {
    state: Option<(i64, i64, u32, u64, Phase)>,
}
impl BrowserShareTask {
    /// One instance belongs to one owned sender process; never pass browser/peer messages here.
    pub fn accept(&mut self, store: &mut Store, shelf: i64, line: &[u8]) -> Result<i64> {
        if line.len() > 1024 {
            return Err("分享任务事件过大".into());
        }
        let event: Event = serde_json::from_slice(line).map_err(|_| "分享任务事件无效")?;
        if event.version != 1
            || !(1..=16).contains(&event.files)
            || event.total > 16 * 512 * 1024 * 1024
        {
            return Err("分享任务事件无效".into());
        }
        let Some((job, owner, files, total, previous)) = self.state else {
            if event.phase != Phase::Queued {
                return Err("分享任务必须从等待状态开始".into());
            }
            let job = store.begin_job(shelf, "浏览器分享：准备中")?;
            self.state = Some((job, shelf, event.files, event.total, Phase::Queued));
            return Ok(job);
        };
        if owner != shelf
            || files != event.files
            || total != event.total
            || !matches!(previous, Phase::Queued | Phase::Waiting)
            || !matches!(
                (previous, event.phase),
                (
                    Phase::Queued,
                    Phase::Waiting | Phase::Failed | Phase::Cancelled
                ) | (
                    Phase::Waiting,
                    Phase::Verified | Phase::Failed | Phase::Cancelled
                )
            )
        {
            return Err("分享任务状态不一致，保留原记录".into());
        }
        let (status, message) = match event.phase {
            Phase::Waiting => ("copying", "浏览器分享：等待接收或传输中"),
            Phase::Verified => ("completed", "浏览器分享：对方已确认内容校验"),
            Phase::Failed => ("failed", "浏览器分享：未确认完成，来源保留"),
            Phase::Cancelled => ("cancelled", "浏览器分享：已停止，来源保留"),
            Phase::Queued => unreachable!(),
        };
        store.finish_transfer_job(
            job,
            shelf,
            status,
            &format!("{message} · {files} 项 · {total} B"),
        )?;
        self.state = Some((job, shelf, files, total, event.phase));
        Ok(job)
    }

    /// Process exit alone is never evidence of a successful transfer.
    pub fn exited(&mut self, store: &mut Store) -> Result<()> {
        if let Some((job, shelf, files, total, phase)) = self.state
            && matches!(phase, Phase::Queued | Phase::Waiting)
        {
            store.finish_transfer_job(
                job,
                shelf,
                "failed",
                "浏览器分享中断，需核对接收结果；来源保留",
            )?;
            self.state = Some((job, shelf, files, total, Phase::Failed));
        }
        Ok(())
    }
}
