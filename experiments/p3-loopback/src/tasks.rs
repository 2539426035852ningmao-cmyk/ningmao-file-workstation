use crate::Result;
use ningmao_transfer_contract::{Phase, TaskEvent};
use std::{
    fs::File,
    io::Write,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

pub type Journal = Arc<Mutex<File>>;
pub struct ReceiverTask {
    event: TaskEvent,
    journal: Journal,
    active: u32,
    settled: u32,
    cancelling: bool,
    last_bytes: u64,
    last_emit: Instant,
}
impl ReceiverTask {
    pub fn new(journal: Journal, files: u32, total: u64) -> Result<Self> {
        let mut task = Self {
            event: TaskEvent {
                version: 1,
                task: uuid::Uuid::new_v4().to_string(),
                sequence: 0,
                phase: Phase::Queued,
                files,
                completed: 0,
                bytes: 0,
                total,
            },
            journal,
            active: 0,
            settled: 0,
            cancelling: false,
            last_bytes: 0,
            last_emit: Instant::now(),
        };
        task.emit(Phase::Queued)?;
        Ok(task)
    }
    fn emit(&mut self, phase: Phase) -> Result<()> {
        if self.event.phase.terminal() {
            return Ok(());
        }
        self.event.phase = phase;
        self.event.sequence += 1;
        let mut line = serde_json::to_vec(&self.event)?;
        line.push(b'\n');
        self.journal
            .lock()
            .map_err(|_| "task journal lock")?
            .write_all(&line)?;
        self.last_bytes = self.event.bytes;
        self.last_emit = Instant::now();
        Ok(())
    }
    pub fn start(&mut self) -> Result<()> {
        self.active += 1;
        self.emit(Phase::Receiving)
    }
    pub fn advance(&mut self, bytes: u64) -> Result<()> {
        self.event.bytes += bytes;
        if !self.cancelling
            && (self.event.bytes - self.last_bytes >= 1024 * 1024
                || self.last_emit.elapsed() >= Duration::from_millis(100))
        {
            self.emit(Phase::Receiving)?;
        }
        Ok(())
    }
    pub fn verifying(&mut self) -> Result<()> {
        if !self.cancelling {
            self.emit(Phase::Verifying)?;
        }
        Ok(())
    }
    pub fn cancel(&mut self) -> Result<()> {
        if self.event.phase.terminal() {
            return Ok(());
        }
        self.cancelling = true;
        self.settled = self.event.files - self.active;
        self.emit(Phase::Cancelling)?;
        if self.active == 0 {
            self.emit(Phase::Cancelled)?;
        }
        Ok(())
    }
    /// Called only after the staging object has been published or dropped.
    pub fn finish(&mut self, published: bool) -> Result<()> {
        self.active -= 1;
        self.settled += 1;
        self.event.completed += u32::from(published);
        let phase = if self.cancelling {
            if self.active == 0 {
                Phase::Cancelled
            } else {
                Phase::Cancelling
            }
        } else if self.settled == self.event.files {
            if self.event.completed == self.event.files {
                Phase::Completed
            } else if self.event.completed > 0 {
                Phase::Partial
            } else {
                Phase::Failed
            }
        } else {
            Phase::Receiving
        };
        self.emit(phase)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn active_cancel_waits_for_cleanup_and_late_cancel_preserves_success() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("events.jsonl");
        let journal = Arc::new(Mutex::new(File::create(&path).unwrap()));
        let mut task = ReceiverTask::new(journal.clone(), 2, 100).unwrap();
        task.start().unwrap();
        task.advance(30).unwrap();
        task.cancel().unwrap();
        assert_eq!(task.event.phase, Phase::Cancelling);
        task.finish(false).unwrap();
        assert_eq!(task.event.phase, Phase::Cancelled);
        let seq = task.event.sequence;
        task.cancel().unwrap();
        assert_eq!(task.event.sequence, seq);
        let mut task = ReceiverTask::new(journal, 1, 0).unwrap();
        task.start().unwrap();
        task.verifying().unwrap();
        task.finish(true).unwrap();
        task.cancel().unwrap();
        assert_eq!(task.event.phase, Phase::Completed);
        let events: Vec<TaskEvent> = std::fs::read_to_string(path)
            .unwrap()
            .lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        assert!(events.iter().any(|e| e.phase == Phase::Verifying));
    }
}
