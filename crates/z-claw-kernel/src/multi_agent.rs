use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DelegateTask {
    pub task_id: String,
    pub session_id: String,
    pub target_agent_id: String,
    pub instruction: String,
}

pub struct AgentMessageBus {
    tx: broadcast::Sender<DelegateTask>,
}

impl AgentMessageBus {
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity.max(16));
        Self { tx }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<DelegateTask> {
        self.tx.subscribe()
    }

    pub fn publish(&self, task: DelegateTask) {
        let _ = self.tx.send(task);
    }
}

pub fn new_delegate_task(
    session_id: impl Into<String>,
    target_agent_id: impl Into<String>,
    instruction: impl Into<String>,
) -> DelegateTask {
    DelegateTask {
        task_id: Uuid::new_v4().to_string(),
        session_id: session_id.into(),
        target_agent_id: target_agent_id.into(),
        instruction: instruction.into(),
    }
}

#[derive(Debug, Clone, Copy)]
pub enum MergeStrategy {
    ConcatSections,
    TakeFirst,
}

pub fn merge_swarm_results(strategy: MergeStrategy, parts: &[(String, String)]) -> String {
    match strategy {
        MergeStrategy::ConcatSections => parts
            .iter()
            .map(|(label, text)| format!("## {label}\n{text}\n"))
            .collect::<Vec<_>>()
            .join("\n"),
        MergeStrategy::TakeFirst => parts
            .first()
            .map(|(_, t)| t.clone())
            .unwrap_or_default(),
    }
}
