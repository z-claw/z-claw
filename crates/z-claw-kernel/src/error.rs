use thiserror::Error;

#[derive(Debug, Error)]
pub enum KernelError {
    #[error("database: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("mcp: {0}")]
    Mcp(String),
    #[error("invalid cron expression: {0}")]
    InvalidCron(String),
    #[error("policy denied: {0}")]
    PolicyDenied(String),
    #[error("{0}")]
    Message(String),
}

pub type Result<T> = std::result::Result<T, KernelError>;
