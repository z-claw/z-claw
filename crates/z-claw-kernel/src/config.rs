use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

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
    /// Environment variable name holding the API key (never store raw key in config file).
    pub api_key_env: String,
    #[serde(default)]
    pub default_model: Option<String>,
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
    pub fn load_or_default() -> Self {
        let path = default_config_path();
        if let Ok(bytes) = std::fs::read(&path) {
            if let Ok(c) = serde_json::from_slice::<AppConfig>(&bytes) {
                return c;
            }
        }
        AppConfig {
            providers: vec![ProviderDef {
                id: "openai".into(),
                base_url: "https://api.openai.com/v1".into(),
                api_key_env: "OPENAI_API_KEY".into(),
                default_model: Some("gpt-4o-mini".into()),
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

/// Config file path (same as `load_or_default` reads).
pub fn config_file_path() -> std::path::PathBuf {
    default_config_path()
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
    json!({
        "default_provider_id": cfg.default_provider_id,
        "default_model": cfg.default_model,
        "providers": cfg.providers.iter().map(|p| json!({
            "id": p.id,
            "base_url": p.base_url,
            "api_key_env": p.api_key_env,
            "default_model": p.default_model,
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
