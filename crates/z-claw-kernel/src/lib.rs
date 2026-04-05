//! z-claw agent kernel: orchestration, providers, MCP, memory, scheduling, policy.

pub mod config;
pub mod error;
pub mod health;
pub mod kernel;
pub mod mcp_pool;
pub mod memory;
pub mod multi_agent;
pub mod orchestrator;
pub mod policy;
pub mod protocol;
pub mod provider;
pub mod scheduler;

pub use config::AppConfig;
pub use error::{KernelError, Result};
pub use protocol::{KernelEvent, UiCommand};

pub use kernel::spawn_kernel;
