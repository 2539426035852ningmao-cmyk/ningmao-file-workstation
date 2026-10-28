pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
mod client;
pub use client::LoopbackClient;
#[cfg(feature = "probe-cli")]
mod probe;
#[cfg(feature = "probe-cli")]
pub use probe::main;
#[cfg(test)]
#[allow(dead_code)]
#[path = "../../../apps/desktop/src-tauri/src/store.rs"]
mod store;
#[cfg(test)]
#[allow(dead_code)]
#[path = "../../../apps/desktop/src-tauri/src/transfer_runtime.rs"]
mod transfer_runtime;
#[cfg(test)]
#[path = "../../../apps/desktop/src-tauri/src/transfer_tasks.rs"]
mod transfer_tasks;
