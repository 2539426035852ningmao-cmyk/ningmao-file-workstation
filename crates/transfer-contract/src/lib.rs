//! Internal events contain no transport credentials, peer addresses or local paths.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Queued,
    Receiving,
    Verifying,
    Cancelling,
    Completed,
    Partial,
    Failed,
    Cancelled,
}
impl Phase {
    pub fn terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Partial | Self::Failed | Self::Cancelled
        )
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct TaskEvent {
    pub version: u8,
    /// Independent task identity, never a session ID or upload bearer token.
    pub task: String,
    pub sequence: u64,
    pub phase: Phase,
    pub files: u32,
    pub completed: u32,
    pub bytes: u64,
    pub total: u64,
}
