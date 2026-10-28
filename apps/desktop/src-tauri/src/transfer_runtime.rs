//! Trusted Rust-side transfer events -> existing Store. No network or IPC entry point.
use crate::{
    store::{Result, Store},
    transfer_tasks::TransferTasks,
};
use ningmao_transfer_contract::{Phase, TaskEvent};
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TransferProgress {
    pub job_id: i64,
    pub phase: Phase,
}

#[derive(Default)]
pub struct TransferRuntime {
    adapter: TransferTasks,
    tasks: HashMap<String, (i64, i64, bool)>,
    faulted: bool,
    closed: bool,
}

impl TransferRuntime {
    /// Called only by a trusted worker adapter; peer-provided paths and credentials never enter here.
    /// A notification may be emitted only when this method returns a persisted progress value.
    pub fn accept(
        &mut self,
        store: &mut Store,
        shelf: i64,
        line: &[u8],
    ) -> Result<Option<TransferProgress>> {
        let result = (|| {
            if self.closed || self.faulted || line.len() > 1024 {
                return Err("传输事件不可用，请核对任务状态。".into());
            }
            let event: TaskEvent = serde_json::from_slice(line)
                .map_err(|_| "传输事件格式无效，请核对任务状态。".to_string())?;
            let Some(job_id) = self.adapter.apply(store, shelf, &event)? else {
                return Ok(None);
            };
            self.tasks
                .insert(event.task, (job_id, shelf, event.phase.terminal()));
            Ok(Some(TransferProgress {
                job_id,
                phase: event.phase,
            }))
        })();
        if result.is_err() {
            self.faulted = true;
        }
        result
    }

    /// The caller must drain the worker's stream before closing the runtime.
    /// Preserve already terminal results; never turn a missing terminal into success.
    pub fn worker_exited(
        &mut self,
        store: &mut Store,
        worker_success: bool,
        stream_complete: bool,
    ) -> Result<()> {
        if self.closed {
            return Err("传输运行过程已结束。".into());
        }
        self.closed = true;
        let mut incomplete = false;
        let mut persistence_failed = false;
        for (id, shelf, terminal) in self.tasks.values_mut() {
            if !*terminal {
                incomplete = true;
                if store
                    .finish_transfer_job(
                        *id,
                        *shelf,
                        "interrupted",
                        "接收任务异常中断；已完成文件保留，请核对接收目录。",
                    )
                    .is_ok()
                {
                    *terminal = true;
                } else {
                    persistence_failed = true;
                }
            }
        }
        if self.faulted
            || !worker_success
            || !stream_complete
            || self.tasks.is_empty()
            || incomplete
            || persistence_failed
        {
            return Err("传输未确认完整结束，请核对任务和接收目录。".into());
        }
        Ok(())
    }
}
