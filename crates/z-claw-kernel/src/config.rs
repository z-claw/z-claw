use crate::error::{KernelError, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    #[serde(default)]
    pub providers: Vec<ProviderDef>,
    #[serde(default)]
    pub default_provider_id: Option<String>,
    #[serde(default)]
    pub default_model: Option<String>,
    #[serde(default)]
    pub mcp_servers: Vec<McpServerDef>,
    #[serde(default)]
    pub routing: RoutingConfig,
    #[serde(default)]
    pub policy: PolicyConfig,
    #[serde(default)]
    pub memory: MemoryConfig,
    #[serde(default)]
    pub data_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderDef {
    pub id: String,
    /// OpenAI-compatible chat completions base, e.g. https://api.openai.com/v1
    pub base_url: String,
    /// Environment variable name for the API key. Non-empty env **overrides** `api_key` below.
    pub api_key_env: String,
    #[serde(default)]
    pub default_model: Option<String>,
    /// Optional key stored in the config file (avoid sharing the file). Prefer `api_key_env` when possible.
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
}

/// Resolve API key: non-empty `api_key_env` wins; else non-empty inline `api_key`.
pub fn resolve_provider_api_key(p: &ProviderDef) -> Result<String> {
    if let Ok(v) = std::env::var(&p.api_key_env) {
        let t = v.trim();
        if !t.is_empty() {
            return Ok(t.to_string());
        }
    }
    if let Some(ref k) = p.api_key {
        let t = k.trim();
        if !t.is_empty() {
            return Ok(t.to_string());
        }
    }
    Err(KernelError::Message(format!(
        "set environment variable {} or \"api_key\" in config for provider {}",
        p.api_key_env, p.id
    )))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerDef {
    pub id: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    /// If true, process starts on first use.
    #[serde(default)]
    pub lazy: bool,
    #[serde(default)]
    pub tool_namespace_prefix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RoutingConfig {
    /// 备用提供商 `id` 列表（须出现在 `providers` 中）。主请求失败时按顺序重试；缺密钥的条目在启动时跳过。
    #[serde(default)]
    pub fallback_chain: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PolicyConfig {
    #[serde(default)]
    pub allowed_path_prefixes: Vec<String>,
    #[serde(default)]
    pub blocked_tool_names: Vec<String>,
    /// Minimum interval between cron fires for model-submitted jobs (seconds).
    #[serde(default = "default_min_schedule_interval_sec")]
    pub min_schedule_interval_sec: u64,
    #[serde(default = "default_max_swarm_tasks")]
    pub max_swarm_tasks: usize,
}

fn default_min_schedule_interval_sec() -> u64 {
    60
}

fn default_max_swarm_tasks() -> usize {
    8
}

/// Long transcript handling + recall limits (see `docs/policy-and-audit.md`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryConfig {
    /// When enabled, old `messages` rows are summarized into `episodic` after the threshold.
    #[serde(default)]
    pub compaction_enabled: bool,
    #[serde(default = "default_compaction_message_threshold")]
    pub compaction_message_threshold: usize,
    #[serde(default = "default_compaction_keep_recent")]
    pub compaction_keep_recent: usize,
    #[serde(default = "default_compaction_summary_max_chars")]
    pub compaction_summary_max_chars: usize,
    /// Upper bound for `MemoryRecall` and internal recall budgets (tokens ≈ chars/4).
    #[serde(default = "default_max_recall_budget_tokens")]
    pub max_recall_budget_tokens: u32,
}

impl Default for MemoryConfig {
    fn default() -> Self {
        Self {
            compaction_enabled: false,
            compaction_message_threshold: default_compaction_message_threshold(),
            compaction_keep_recent: default_compaction_keep_recent(),
            compaction_summary_max_chars: default_compaction_summary_max_chars(),
            max_recall_budget_tokens: default_max_recall_budget_tokens(),
        }
    }
}

fn default_compaction_message_threshold() -> usize {
    96
}

fn default_compaction_keep_recent() -> usize {
    48
}

fn default_compaction_summary_max_chars() -> usize {
    8000
}

fn default_max_recall_budget_tokens() -> u32 {
    8192
}

impl AppConfig {
    /// 读取 `dirs::config_dir()/z-claw/config.json`。
    /// - **已存在**：启动时直接读盘并反序列化，成功则使用该配置。
    /// - **不存在**：创建目录并写入内置默认 `config.json` 后使用。
    /// - **存在但不可读或 JSON 无效**：返回内存默认（不覆盖磁盘文件）。
    pub fn load_or_default() -> Self {
        let path = default_config_path();

        if path.exists() {
            match std::fs::read(&path) {
                Ok(bytes) => match parse_config_bytes(&bytes) {
                    Ok(c) => return c,
                    Err(e) => {
                        tracing::warn!(
                            path = %path.display(),
                            error = %e,
                            "config.json exists but is invalid JSON; using in-memory defaults"
                        );
                    }
                },
                Err(e) => {
                    tracing::warn!(
                        path = %path.display(),
                        error = %e,
                        "config.json exists but could not be read; using in-memory defaults"
                    );
                }
            }
            return Self::builtin_default();
        }

        let cfg = Self::builtin_default();
        match write_config_file(&path, &cfg) {
            Ok(()) => {
                tracing::info!(path = %path.display(), "initialized default config.json");
                cfg
            }
            Err(e) => {
                tracing::warn!(
                    path = %path.display(),
                    error = %e,
                    "failed to write default config; using in-memory defaults"
                );
                cfg
            }
        }
    }

    fn builtin_default() -> Self {
        Self {
            providers: vec![ProviderDef {
                id: "openai".into(),
                base_url: "https://api.openai.com/v1".into(),
                api_key_env: "OPENAI_API_KEY".into(),
                default_model: Some("gpt-4o-mini".into()),
                api_key: None,
            }],
            default_provider_id: Some("openai".into()),
            default_model: Some("gpt-4o-mini".into()),
            mcp_servers: vec![],
            routing: RoutingConfig::default(),
            policy: PolicyConfig::default(),
            memory: MemoryConfig::default(),
            data_dir: None,
        }
    }
}

fn write_config_file(path: &std::path::Path, cfg: &AppConfig) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let text = serde_json::to_string_pretty(cfg).map_err(|e| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string())
    })?;
    std::fs::write(path, text)
}

/// Config file path (same as `load_or_default` reads).
pub fn config_file_path() -> std::path::PathBuf {
    default_config_path()
}

/// Strip UTF-8 BOM (common for Windows Notepad) before JSON parse.
fn strip_utf8_bom(bytes: &[u8]) -> &[u8] {
    if bytes.len() >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF {
        &bytes[3..]
    } else {
        bytes
    }
}

/// Parse `config.json` bytes (with optional BOM). Shared by startup load, hot reload, health check.
pub fn parse_config_bytes(bytes: &[u8]) -> Result<AppConfig> {
    Ok(serde_json::from_slice::<AppConfig>(strip_utf8_bom(bytes))?)
}

/// Re-read `config.json` from disk (does not write defaults). Used when hot-reloading.
pub fn reload_from_disk() -> Result<AppConfig> {
    let bytes = std::fs::read(config_file_path())?;
    parse_config_bytes(&bytes)
}

fn default_config_path() -> std::path::PathBuf {
    let base = dirs_config_dir();
    let _ = std::fs::create_dir_all(&base);
    base.join("config.json")
}

fn dirs_config_dir() -> std::path::PathBuf {
    if let Some(p) = dirs::config_dir() {
        return p.join("z-claw");
    }
    std::path::PathBuf::from(".z-claw")
}

/// 供 UI 展示的运行时配置快照（不含 API 密钥，仅 `api_key_env` 名称）。
pub fn snapshot_for_ui(cfg: &AppConfig) -> Value {
    let path = config_file_path();
    let resolved = std::fs::canonicalize(&path).unwrap_or(path);
    json!({
        "config_file_path": resolved.to_string_lossy(),
        "default_provider_id": cfg.default_provider_id,
        "default_model": cfg.default_model,
        "providers": cfg.providers.iter().map(|p| json!({
            "id": p.id,
            "base_url": p.base_url,
            "api_key_env": p.api_key_env,
            "default_model": p.default_model,
            "has_inline_api_key": p.api_key.as_ref().is_some_and(|k| !k.trim().is_empty()),
        })).collect::<Vec<_>>(),
        "mcp_servers": cfg.mcp_servers.iter().map(|m| json!({
            "id": m.id,
            "command": m.command,
            "args": m.args,
            "lazy": m.lazy,
            "tool_namespace_prefix": m.tool_namespace_prefix,
        })).collect::<Vec<_>>(),
        "routing": {
            "fallback_chain": cfg.routing.fallback_chain,
        },
        "policy": {
            "allowed_path_prefixes": cfg.policy.allowed_path_prefixes,
            "blocked_tool_names": cfg.policy.blocked_tool_names,
            "min_schedule_interval_sec": cfg.policy.min_schedule_interval_sec,
            "max_swarm_tasks": cfg.policy.max_swarm_tasks,
        },
        "memory": {
            "compaction_enabled": cfg.memory.compaction_enabled,
            "compaction_message_threshold": cfg.memory.compaction_message_threshold,
            "compaction_keep_recent": cfg.memory.compaction_keep_recent,
            "compaction_summary_max_chars": cfg.memory.compaction_summary_max_chars,
            "max_recall_budget_tokens": cfg.memory.max_recall_budget_tokens,
        },
        "data_dir": cfg.data_dir,
    })
}
