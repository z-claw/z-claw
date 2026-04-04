use serde::{Deserialize, Serialize};

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
            data_dir: None,
        }
    }
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
