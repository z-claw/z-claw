use serde::{Deserialize, Serialize};

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
    /// Refresh MCP tool catalog for all connected (or lazy) servers.
    RefreshMcpTools,
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
        reason: String,
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
        line: String,
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
pub struct ScheduledJobSummary {
    pub id: String,
    pub cron_expr: String,
    pub timezone: String,
    pub enabled: bool,
    pub prompt_preview: String,
}
