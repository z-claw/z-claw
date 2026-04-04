use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Commands sent from the GPUI shell to the kernel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UiCommand {
    Shutdown,
    /// Create a new chat session.
    CreateSession { title: Option<String> },
    /// Send a user message and run one model turn (may include tools).
    SendMessage {
        session_id: String,
        content: String,
    },
    ListSessions,
    /// Push a redacted config + runtime snapshot to the UI (`ConfigSnapshot` event).
    GetConfigSnapshot,
    /// Refresh MCP tool catalog for all connected (or lazy) servers.
    RefreshMcpTools,
    /// Run connectivity / filesystem checks (OpenClaw-style `doctor`).
    RunHealthCheck,
    /// Propose a cron job (validated by policy before persistence).
    ScheduleAdd {
        cron_expr: String,
        /// IANA timezone name, e.g. "UTC".
        timezone: String,
        payload: SchedulePayload,
    },
    ScheduleRemove { job_id: String },
    ScheduleList,
    /// Run a swarm of sub-tasks and merge results (policy-bounded).
    RunSwarm {
        session_id: String,
        tasks: Vec<SwarmSubTask>,
    },
    /// Delegate work to another agent profile (queued).
    Delegate {
        session_id: String,
        target_agent_id: String,
        instruction: String,
    },
    MemoryRecall {
        session_id: String,
        query: String,
        budget_tokens: u32,
    },
    MemoryForget { entry_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulePayload {
    pub prompt: String,
    pub target_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmSubTask {
    pub label: String,
    pub instruction: String,
}

/// Events emitted from the kernel to the UI (and automation hooks).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum KernelEvent {
    Ready,
    Error { message: String },
    SessionCreated {
        id: String,
        title: String,
    },
    SessionsList {
        sessions: Vec<SessionSummary>,
    },
    MessageDelta {
        session_id: String,
        role: String,
        delta: String,
    },
    MessageComplete {
        session_id: String,
        role: String,
        full_text: String,
    },
    ToolCallStarted {
        session_id: String,
        tool_name: String,
    },
    ToolCallFinished {
        session_id: String,
        tool_name: String,
        ok: bool,
        summary: String,
    },
    PolicyBlocked {
        /// Machine-readable category for UI and logs.
        code: PolicyBlockCode,
        /// Human-readable explanation (may duplicate legacy `reason` in older clients).
        message: String,
    },
    McpToolsUpdated {
        servers: Vec<McpServerToolsSummary>,
    },
    ScheduleJobAdded { job_id: String },
    ScheduleJobRemoved { job_id: String },
    ScheduleList {
        jobs: Vec<ScheduledJobSummary>,
    },
    SwarmPartial {
        session_id: String,
        label: String,
        text: String,
    },
    SwarmMerged {
        session_id: String,
        text: String,
    },
    DelegateQueued {
        session_id: String,
        target_agent_id: String,
        task_id: String,
    },
    MemoryRecalled {
        session_id: String,
        snippets: Vec<String>,
    },
    AuditEntry {
        record: AuditRecord,
    },
    HealthReport {
        checked_at_ms: i64,
        items: Vec<HealthCheckItem>,
    },
    /// Effective configuration (no secrets). `snapshot` merges file config + runtime fields.
    ConfigSnapshot {
        snapshot: Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerToolsSummary {
    pub server_id: String,
    pub tool_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PolicyBlockCode {
    ToolBlocked,
    PathNotAllowed,
    ScheduleDenied,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditKind {
    Tool,
    Schedule,
    Policy,
    General,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditRecord {
    pub timestamp_ms: i64,
    pub kind: AuditKind,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckItem {
    pub id: String,
    pub ok: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledJobSummary {
    pub id: String,
    pub cron_expr: String,
    pub timezone: String,
    pub enabled: bool,
    pub prompt_preview: String,
}
