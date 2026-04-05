use super::turn::persist_assistant_turn;
use super::KernelState;
use crate::error::Result;
use crate::multi_agent::{self, MergeStrategy};
use crate::protocol::{KernelEvent, SwarmSubTask};
use crate::provider::{ChatMessage, ChatRequest, chat_complete_with_fallback};
use std::sync::Arc;

pub(super) async fn run_swarm_command(
    state: &Arc<KernelState>,
    session_id: String,
    tasks: Vec<SwarmSubTask>,
) {
    let cap = state.policy.max_swarm_tasks();
    let tasks: Vec<SwarmSubTask> = tasks.into_iter().take(cap).collect();
    let mut parts = vec![];
    for t in tasks {
        let r = run_swarm_worker(state, &t.instruction).await;
        let text = r.unwrap_or_else(|e| format!("(error: {e})"));
        let _ = state.event_tx.send(KernelEvent::SwarmPartial {
            session_id: session_id.clone(),
            label: t.label.clone(),
            text: text.clone(),
        });
        parts.push((t.label, text));
    }
    let merged = multi_agent::merge_swarm_results(MergeStrategy::ConcatSections, &parts);
    let sid = session_id.clone();
    let _ = state.event_tx.send(KernelEvent::SwarmMerged {
        session_id: sid.clone(),
        text: merged.clone(),
    });
    if let Err(e) = persist_assistant_turn(state.as_ref(), &sid, &merged) {
        let _ = state.event_tx.send(KernelEvent::Error {
            message: format!("swarm persist failed: {e}"),
        });
    }
}

async fn run_swarm_worker(state: &KernelState, instruction: &str) -> Result<String> {
    let _ = super::try_reload_runtime_from_disk(state);
    let (max_recall, llm_routing, primary_model) = {
        let rt = state.runtime.read();
        (
            rt.cfg.memory.max_recall_budget_tokens,
            rt.llm_routing.clone(),
            rt.llm_routing
                .first()
                .map(|(_, m)| m.clone())
                .unwrap_or_default(),
        )
    };
    let recall = state.memory.recall(
        "swarm",
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
    let req = ChatRequest {
        model: primary_model,
        messages,
        tools: vec![],
        stream: false,
    };
    chat_complete_with_fallback(&llm_routing, req).await
}
