use super::KernelState;
use super::turn::{
    persist_assistant_turn, run_chat_with_tools, ChatWithToolsOutcome, MAX_MODEL_TURN_ROUNDS,
};
use crate::error::{KernelError, Result};
use crate::multi_agent::{self, DelegateTask};
use crate::protocol::KernelEvent;
use crate::provider::ChatMessage;
use std::sync::Arc;

pub(super) fn start_delegate_worker_loop(state: Arc<KernelState>) {
    let mut rx = state.bus.subscribe();
    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(task) => {
                    let state = state.clone();
                    tokio::spawn(async move {
                        if let Err(e) = handle_delegate_task(state.as_ref(), task).await {
                            let _ = state.event_tx.send(KernelEvent::Error {
                                message: format!("delegate worker failed: {e}"),
                            });
                        }
                    });
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!("delegate bus lagged, skipped {skipped} tasks");
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });
}

pub(super) fn queue_delegate_command(
    state: &Arc<KernelState>,
    session_id: String,
    target_agent_id: String,
    instruction: String,
) {
    let task =
        multi_agent::new_delegate_task(session_id.clone(), target_agent_id.clone(), instruction);
    let tid = task.task_id.clone();
    state.bus.publish(task);
    let _ = state.event_tx.send(KernelEvent::DelegateQueued {
        session_id,
        target_agent_id,
        task_id: tid,
    });
}

async fn handle_delegate_task(state: &KernelState, task: DelegateTask) -> Result<()> {
    let result = match run_delegate_worker(
        state,
        &task.session_id,
        &task.target_agent_id,
        &task.instruction,
    )
    .await
    {
        Ok(text) => format_delegate_result(&task.target_agent_id, &task.task_id, &text),
        Err(e) => format!(
            "[Delegate:{} · {}]\n(error: {e})",
            task.target_agent_id, task.task_id
        ),
    };
    persist_assistant_turn(state, &task.session_id, &result).await
}

async fn run_delegate_worker(
    state: &KernelState,
    session_id: &str,
    target_agent_id: &str,
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
    let system_content = match state
        .workspace_manager
        .load_agent_profile(target_agent_id)
    {
        Ok(p) => format!(
            "You are acting as delegated sub-agent `{id}`.\n\
Follow the identity and long-term memory below. Complete the delegated task and return only the useful result for the parent session.\n\
\n\
## Identity (IDENTITY.md)\n\
{ident}\n\
\n\
## Agent memory (MEMORY.md)\n\
{mem}\n\
\n\
## Retrieved context\n\
{}",
            recall.join("\n"),
            id = p.id,
            ident = p.identity_prompt,
            mem = p.memory_text,
        ),
        Err(e) => {
            tracing::warn!(
                target = %target_agent_id,
                error = %e,
                "delegate: could not load target agent profile; using recall-only system prompt"
            );
            format!(
                "Delegated sub-agent profile: {target_agent_id}\n\
Complete the delegated task and return only the useful result for the parent session.\n\
Context:\n{}",
                recall.join("\n")
            )
        }
    };
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: system_content,
            tool_calls: None,
            tool_call_id: None,
        },
        ChatMessage::user(instruction),
    ];
    let tools = state.mcp.all_openai_tools().await;
    match run_chat_with_tools(state, session_id, messages, tools, MAX_MODEL_TURN_ROUNDS).await? {
        ChatWithToolsOutcome::Finished { assistant_text } => Ok(assistant_text),
        ChatWithToolsOutcome::MaxRoundsExhausted => Err(KernelError::Message(
            "delegate: maximum tool rounds exhausted without a final reply".into(),
        )),
    }
}

fn format_delegate_result(target_agent_id: &str, task_id: &str, text: &str) -> String {
    let text = text.trim();
    if text.is_empty() {
        format!("[Delegate:{target_agent_id} · {task_id}]\n(no output)")
    } else {
        format!("[Delegate:{target_agent_id} · {task_id}]\n{text}")
    }
}
