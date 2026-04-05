use super::{KernelState, classify_policy_denial};
use crate::error::{KernelError, Result};
use crate::protocol::{KernelEvent, PolicyBlockCode};
use crate::provider::{
    ChatMessage, ChatRequest, ResolvedToolCall, ToolCallFragment, ToolDefinition,
    chat_stream_with_fallback,
};
use futures_util::StreamExt;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use uuid::Uuid;

const MAX_MODEL_TURN_ROUNDS: usize = 8;

type ToolCallAccumulator = BTreeMap<usize, (Option<String>, Option<String>, String)>;

struct ModelTurnContext {
    messages: Vec<ChatMessage>,
    tools: Vec<ToolDefinition>,
}

struct StreamTurnOutcome {
    assistant_text: String,
    tool_calls: ToolCallAccumulator,
}

pub(super) async fn emit_mcp_summary(state: &KernelState) -> Result<()> {
    let servers = state.mcp.summarize_tools().await;
    let _ = state
        .event_tx
        .send(KernelEvent::McpToolsUpdated { servers });
    Ok(())
}

pub(super) async fn run_model_turn(
    state: &KernelState,
    session_id: &str,
    _user_line: &str,
    _from_schedule: bool,
) -> Result<()> {
    let _ = super::try_reload_runtime_from_disk(state);
    let ModelTurnContext {
        mut messages,
        tools,
    } = build_turn_context(state, session_id).await?;

    for _round in 0..MAX_MODEL_TURN_ROUNDS {
        let outcome = consume_model_stream(state, session_id, &messages, &tools).await?;
        if outcome.tool_calls.is_empty() {
            persist_assistant_turn(state, session_id, &outcome.assistant_text)?;
            return Ok(());
        }

        messages.push(build_assistant_tool_call_message(
            outcome.assistant_text,
            &outcome.tool_calls,
        ));
        let resolved = resolve_tool_calls(&outcome.tool_calls)?;
        messages.extend(execute_tool_calls(state, session_id, resolved).await);
    }
    Ok(())
}

pub(super) fn persist_assistant_turn(
    state: &KernelState,
    session_id: &str,
    assistant_text: &str,
) -> Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    let mid = Uuid::new_v4().to_string();
    state
        .memory
        .append_message(&mid, session_id, "assistant", assistant_text, now)?;
    let mem = state.runtime.read().cfg.memory.clone();
    let _ = state.memory.maybe_compact_session(
        session_id,
        mem.compaction_enabled,
        mem.compaction_message_threshold,
        mem.compaction_keep_recent,
        mem.compaction_summary_max_chars,
    );
    let _ = state.event_tx.send(KernelEvent::MessageComplete {
        session_id: session_id.to_string(),
        role: "assistant".into(),
        full_text: assistant_text.to_string(),
    });
    Ok(())
}

async fn build_turn_context(state: &KernelState, session_id: &str) -> Result<ModelTurnContext> {
    let max_recall = state.runtime.read().cfg.memory.max_recall_budget_tokens;
    let recall = state.memory.recall(
        session_id,
        state.workspace_root.as_deref(),
        "",
        2048,
        max_recall,
    )?;
    let hist = state.memory.load_recent_messages(session_id, 48)?;
    let mut messages = vec![ChatMessage {
        role: "system".into(),
        content: format!(
            "You are z-claw desktop agent. Retrieved memory:\n{}",
            recall.join("\n---\n")
        ),
        tool_calls: None,
        tool_call_id: None,
    }];
    for (role, content) in hist {
        messages.push(ChatMessage {
            role,
            content,
            tool_calls: None,
            tool_call_id: None,
        });
    }

    let tools = state.mcp.all_openai_tools().await;
    Ok(ModelTurnContext { messages, tools })
}

async fn consume_model_stream(
    state: &KernelState,
    session_id: &str,
    messages: &[ChatMessage],
    tools: &[ToolDefinition],
) -> Result<StreamTurnOutcome> {
    let (llm_routing, primary_model) = {
        let rt = state.runtime.read();
        (
            rt.llm_routing.clone(),
            rt.llm_routing
                .first()
                .map(|(_, m)| m.clone())
                .unwrap_or_default(),
        )
    };
    let req = ChatRequest {
        model: primary_model,
        messages: messages.to_vec(),
        tools: tools.to_vec(),
        stream: true,
    };
    let mut stream = chat_stream_with_fallback(&llm_routing, req).await?;
    let mut assistant_text = String::new();
    let mut tool_calls = ToolCallAccumulator::new();
    while let Some(item) = stream.next().await {
        let ch = item?;
        if let Some(delta) = ch.content_delta {
            assistant_text.push_str(&delta);
            let _ = state.event_tx.send(KernelEvent::MessageDelta {
                session_id: session_id.to_string(),
                role: "assistant".into(),
                delta,
            });
        }
        merge_tool_call_fragments(&mut tool_calls, ch.tool_calls_delta);
    }
    Ok(StreamTurnOutcome {
        assistant_text,
        tool_calls,
    })
}

fn merge_tool_call_fragments(acc: &mut ToolCallAccumulator, fragments: Vec<ToolCallFragment>) {
    for frag in fragments {
        let entry = acc.entry(frag.index).or_insert((None, None, String::new()));
        if let Some(id) = frag.id {
            entry.0 = Some(id);
        }
        if let Some(name) = frag.name {
            entry.1 = Some(name);
        }
        if let Some(arguments_delta) = frag.arguments_delta {
            entry.2.push_str(&arguments_delta);
        }
    }
}

fn build_assistant_tool_call_message(
    assistant_text: String,
    acc: &ToolCallAccumulator,
) -> ChatMessage {
    let tool_calls_json: Vec<Value> = acc
        .values()
        .map(|(id, name, args)| {
            json!({
                "id": id.clone().unwrap_or_default(),
                "type": "function",
                "function": {
                    "name": name.clone().unwrap_or_default(),
                    "arguments": args
                }
            })
        })
        .collect();

    ChatMessage {
        role: "assistant".into(),
        content: assistant_text,
        tool_calls: Some(json!(tool_calls_json)),
        tool_call_id: None,
    }
}

async fn execute_tool_calls(
    state: &KernelState,
    session_id: &str,
    calls: Vec<ResolvedToolCall>,
) -> Vec<ChatMessage> {
    let mut tool_messages = Vec::with_capacity(calls.len());
    for call in calls {
        let result = execute_tool_call_with_events(state, session_id, &call).await;
        tool_messages.push(ChatMessage::tool(call.id, result));
    }
    tool_messages
}

async fn execute_tool_call_with_events(
    state: &KernelState,
    session_id: &str,
    call: &ResolvedToolCall,
) -> String {
    let _ = state.event_tx.send(KernelEvent::ToolCallStarted {
        session_id: session_id.to_string(),
        tool_name: call.name.clone(),
    });
    let result = execute_tool_call_result(state, call).await;
    let ok = !result.starts_with("policy_blocked") && !result.starts_with("tool_error");
    let _ = state.event_tx.send(KernelEvent::ToolCallFinished {
        session_id: session_id.to_string(),
        tool_name: call.name.clone(),
        ok,
        summary: result.chars().take(200).collect(),
    });
    result
}

async fn execute_tool_call_result(state: &KernelState, call: &ResolvedToolCall) -> String {
    let args_val: Value = serde_json::from_str(&call.arguments_json).unwrap_or(json!({}));
    let args_map = args_val.as_object().cloned().unwrap_or_default();
    match state.policy.validate_tool_call(&call.name, &args_val) {
        Err(e) => {
            let (code, message) = match &e {
                KernelError::PolicyDenied(msg) => (classify_policy_denial(msg), msg.clone()),
                _ => (PolicyBlockCode::Other, e.to_string()),
            };
            let _ = state
                .event_tx
                .send(KernelEvent::PolicyBlocked { code, message });
            format!("policy_blocked: {e}")
        }
        Ok(()) => match execute_tool(state, call, args_map).await {
            Ok(s) => s,
            Err(e) => format!("tool_error: {e}"),
        },
    }
}

fn resolve_tool_calls(acc: &ToolCallAccumulator) -> Result<Vec<ResolvedToolCall>> {
    let mut out = vec![];
    for (_k, (id, name, args)) in acc {
        let id = id
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let name = name
            .clone()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| KernelError::Message("tool call missing name".into()))?;
        out.push(ResolvedToolCall {
            id,
            name,
            arguments_json: args.clone(),
        });
    }
    Ok(out)
}

async fn execute_tool(
    state: &KernelState,
    call: &ResolvedToolCall,
    args: serde_json::Map<String, Value>,
) -> Result<String> {
    if call.name == "load_mcp_server" {
        let sid = args
            .get("server_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| KernelError::Message("load_mcp_server needs server_id".into()))?;
        state.mcp.load_server_and_cache(sid).await?;
        emit_mcp_summary(state).await?;
        return Ok(format!("loaded MCP server {sid}"));
    }

    let (server_id, tool_name) = if let Some((a, b)) = call.name.split_once("::") {
        (a.to_string(), b.to_string())
    } else if let Some(d) = state.runtime.read().default_mcp_server.clone() {
        (d, call.name.clone())
    } else {
        return Err(KernelError::Message(format!(
            "cannot route tool {} (set MCP server or use server::tool)",
            call.name
        )));
    };

    state.mcp.call_on_server(&server_id, &tool_name, args).await
}
