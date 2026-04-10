use super::turn::{
    persist_assistant_turn, run_chat_with_tools, ChatWithToolsOutcome, MAX_MODEL_TURN_ROUNDS,
};
use super::KernelState;
use crate::error::{KernelError, Result};
use crate::multi_agent::{self, MergeStrategy};
use crate::protocol::{KernelEvent, SwarmSubTask};
use crate::provider::ChatMessage;
use std::sync::Arc;
use tokio::task::JoinSet;

pub(super) async fn run_swarm_command(
    state: &Arc<KernelState>,
    session_id: String,
    tasks: Vec<SwarmSubTask>,
) {
    let cap = state.policy.max_swarm_tasks();
    let tasks: Vec<SwarmSubTask> = tasks.into_iter().take(cap).collect();

    // Spawn all workers concurrently; track original index to preserve merge order.
    let mut join_set: JoinSet<(usize, String, String)> = JoinSet::new();
    for (idx, t) in tasks.into_iter().enumerate() {
        let state = Arc::clone(state);
        let session_id = session_id.clone();
        join_set.spawn(async move {
            let text = run_swarm_worker(&state, &session_id, &t.instruction)
                .await
                .unwrap_or_else(|e| format!("(error: {e})"));
            let _ = state.event_tx.send(KernelEvent::SwarmPartial {
                session_id: session_id.clone(),
                label: t.label.clone(),
                text: text.clone(),
            });
            (idx, t.label, text)
        });
    }

    // Collect results as workers complete, then sort to restore original order.
    let mut parts: Vec<(usize, String, String)> = Vec::new();
    while let Some(result) = join_set.join_next().await {
        match result {
            Ok(triple) => parts.push(triple),
            Err(e) => {
                let _ = state.event_tx.send(KernelEvent::Error {
                    message: format!("swarm worker panicked: {e}"),
                });
            }
        }
    }
    parts.sort_unstable_by_key(|(idx, _, _)| *idx);
    let ordered: Vec<(String, String)> = parts
        .into_iter()
        .map(|(_, label, text)| (label, text))
        .collect();

    let merged = multi_agent::merge_swarm_results(MergeStrategy::ConcatSections, &ordered);
    let _ = state.event_tx.send(KernelEvent::SwarmMerged {
        session_id: session_id.clone(),
        text: merged.clone(),
    });
    if let Err(e) = persist_assistant_turn(state.as_ref(), &session_id, &merged).await {
        let _ = state.event_tx.send(KernelEvent::Error {
            message: format!("swarm persist failed: {e}"),
        });
    }
}

async fn run_swarm_worker(
    state: &KernelState,
    session_id: &str,
    instruction: &str,
) -> Result<String> {
    let _ = super::try_reload_runtime_from_disk(state);
    let max_recall = state.runtime.read().cfg.memory.max_recall_budget_tokens;
    let recall = state.memory.recall(
        session_id,
        state.workspace_root.as_deref(),
        instruction,
        1024,
        max_recall,
    )?;
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: format!("Swarm worker. Context:\n{}", recall.join("\n")),
            tool_calls: None,
            tool_call_id: None,
        },
        ChatMessage::user(instruction),
    ];
    let tools = state.mcp.all_openai_tools().await;
    match run_chat_with_tools(state, session_id, messages, tools, MAX_MODEL_TURN_ROUNDS).await? {
        ChatWithToolsOutcome::Finished { assistant_text } => Ok(assistant_text),
        ChatWithToolsOutcome::MaxRoundsExhausted => Err(KernelError::Message(
            "swarm worker: maximum tool rounds exhausted without a final reply".into(),
        )),
    }
}
