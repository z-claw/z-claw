use super::{KernelState, classify_policy_denial};
use crate::error::{KernelError, Result};
use crate::protocol::{KernelEvent, PolicyBlockCode};
use crate::provider::{
    ChatMessage, ChatRequest, ResolvedToolCall, ToolCallFragment, ToolDefinition,
    chat_complete_with_fallback, chat_stream_with_fallback,
};
use futures_util::StreamExt;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::time::Duration;
use uuid::Uuid;

pub(super) const MAX_MODEL_TURN_ROUNDS: usize = 8;

/// Timeout for `execute_command` built-in tool.
const EXECUTE_COMMAND_TIMEOUT_SECS: u64 = 60;
/// Maximum combined stdout+stderr bytes returned from `execute_command`.
const EXECUTE_COMMAND_MAX_OUTPUT_BYTES: usize = 65_536; // 64 KB
/// How long the kernel waits for a UI approval response before auto-rejecting.
const TOOL_APPROVAL_TIMEOUT_SECS: u64 = 120;

type ToolCallAccumulator = BTreeMap<usize, (Option<String>, Option<String>, String)>;

struct ModelTurnContext {
    messages: Vec<ChatMessage>,
    tools: Vec<ToolDefinition>,
}

struct StreamTurnOutcome {
    assistant_text: String,
    tool_calls: ToolCallAccumulator,
}

/// Result of a multi-round chat that may invoke MCP tools (same code path as the main assistant turn).
pub(super) enum ChatWithToolsOutcome {
    Finished { assistant_text: String },
    MaxRoundsExhausted,
}

/// Runs the model with streaming + tool execution rounds until the model returns text without tool calls,
/// or `max_rounds` is hit. Used by the main turn, delegate workers, and swarm workers.
pub(super) async fn run_chat_with_tools(
    state: &KernelState,
    session_id: &str,
    mut messages: Vec<ChatMessage>,
    tools: Vec<ToolDefinition>,
    max_rounds: usize,
) -> Result<ChatWithToolsOutcome> {
    for _round in 0..max_rounds {
        let outcome = consume_model_stream(state, session_id, &messages, &tools).await?;
        if outcome.tool_calls.is_empty() {
            return Ok(ChatWithToolsOutcome::Finished {
                assistant_text: outcome.assistant_text,
            });
        }

        messages.push(build_assistant_tool_call_message(
            outcome.assistant_text,
            &outcome.tool_calls,
        ));
        let resolved = resolve_tool_calls(&outcome.tool_calls)?;
        messages.extend(execute_tool_calls(state, session_id, resolved).await);
    }
    Ok(ChatWithToolsOutcome::MaxRoundsExhausted)
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
    let ModelTurnContext { messages, tools } = build_turn_context(state, session_id).await?;

    match run_chat_with_tools(state, session_id, messages, tools, MAX_MODEL_TURN_ROUNDS).await? {
        ChatWithToolsOutcome::Finished { assistant_text } => {
            persist_assistant_turn(state, session_id, &assistant_text).await?;
        }
        ChatWithToolsOutcome::MaxRoundsExhausted => {}
    }
    Ok(())
}

pub(super) async fn persist_assistant_turn(
    state: &KernelState,
    session_id: &str,
    assistant_text: &str,
) -> Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    let mid = Uuid::new_v4().to_string();
    state
        .memory
        .append_message(&mid, session_id, "assistant", assistant_text, now)?;
    run_session_compaction(state, session_id).await?;
    let _ = state.event_tx.send(KernelEvent::MessageComplete {
        session_id: session_id.to_string(),
        role: "assistant".into(),
        full_text: assistant_text.to_string(),
    });
    Ok(())
}

const COMPACTION_LLM_INPUT_MAX_CHARS: usize = 120_000;

async fn run_session_compaction(state: &KernelState, session_id: &str) -> Result<()> {
    let mem = state.runtime.read().cfg.memory.clone();
    if !mem.compaction_enabled {
        return Ok(());
    }
    let Some(job) = state.memory.peek_compaction_job(
        session_id,
        mem.compaction_enabled,
        mem.compaction_message_threshold,
        mem.compaction_keep_recent,
    )?
    else {
        return Ok(());
    };
    let raw = job.joined_blob();
    let summary_body = if mem.compaction_llm_summary {
        let clipped = truncate_chars(&raw, COMPACTION_LLM_INPUT_MAX_CHARS);
        match summarize_compaction_with_llm(state, &clipped).await {
            Ok(s) => {
                let t = s.trim();
                if t.is_empty() {
                    tracing::warn!("compaction LLM returned empty; falling back to truncation");
                    truncate_chars(&raw, mem.compaction_summary_max_chars)
                } else {
                    truncate_chars(t, mem.compaction_summary_max_chars)
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "compaction LLM failed; using truncated raw blob");
                truncate_chars(&raw, mem.compaction_summary_max_chars)
            }
        }
    } else {
        truncate_chars(&raw, mem.compaction_summary_max_chars)
    };
    state
        .memory
        .apply_compaction(session_id, &job, &summary_body)
}

fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        s.chars().take(max).collect()
    }
}

async fn summarize_compaction_with_llm(state: &KernelState, blob: &str) -> Result<String> {
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
        messages: vec![
            ChatMessage {
                role: "system".into(),
                content: "You summarize conversation excerpts into compact factual notes for long-term memory. Preserve names, decisions, tools used, and open questions. Output plain text only, no preamble.".into(),
                tool_calls: None,
                tool_call_id: None,
            },
            ChatMessage::user(blob),
        ],
        tools: vec![],
        stream: false,
    };
    chat_complete_with_fallback(&llm_routing, req).await
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
    let active_agent_id = state.active_agent_id.read().clone();
    let profile = state
        .workspace_manager
        .load_agent_profile(&active_agent_id)
        .unwrap_or_else(|_| crate::workspace::AgentProfile {
            id: "Fallback".into(),
            identity_prompt: "You are the Z-Claw AI Agent.".into(),
            memory_text: "".into(),
        });

    let hist = state.memory.load_recent_messages(session_id, 48)?;
    let now_local = chrono::Local::now();
    let mut messages = vec![ChatMessage {
        role: "system".into(),
        content: format!(
            "[CurrentTime: {} | LocalOffset: {}]\n[{}]\n{}\n\n[Long-term Memory]\n{}\n\n[Retrieved Context]\n{}",
            now_local.to_rfc3339_opts(chrono::SecondsFormat::Millis, false),
            now_local.format("%:z"),
            profile.id,
            profile.identity_prompt,
            profile.memory_text,
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
    let result = execute_tool_call_result(state, session_id, call).await;
    let ok = !result.starts_with("policy_blocked") && !result.starts_with("tool_error");
    let _ = state.event_tx.send(KernelEvent::ToolCallFinished {
        session_id: session_id.to_string(),
        tool_name: call.name.clone(),
        ok,
        summary: result.chars().take(200).collect(),
    });
    result
}

async fn execute_tool_call_result(
    state: &KernelState,
    session_id: &str,
    call: &ResolvedToolCall,
) -> String {
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
        Ok(()) => {
            // Require explicit user approval for dangerous tools when the policy is enabled.
            if state.policy.require_tool_approval() && is_dangerous_tool(&call.name) {
                let approval_id = Uuid::new_v4().to_string();
                let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
                state
                    .pending_approvals
                    .write()
                    .insert(approval_id.clone(), tx);
                let _ = state.event_tx.send(KernelEvent::ToolApprovalRequested {
                    approval_id: approval_id.clone(),
                    session_id: session_id.to_string(),
                    tool_name: call.name.clone(),
                    arguments_json: call.arguments_json.clone(),
                });
                match tokio::time::timeout(
                    Duration::from_secs(TOOL_APPROVAL_TIMEOUT_SECS),
                    rx,
                )
                .await
                {
                    Ok(Ok(true)) => { /* approved — fall through to execute */ }
                    Ok(Ok(false)) => {
                        return "policy_blocked: tool execution rejected by user".into();
                    }
                    Ok(Err(_)) => {
                        state.pending_approvals.write().remove(&approval_id);
                        return "policy_blocked: tool approval channel closed".into();
                    }
                    Err(_elapsed) => {
                        state.pending_approvals.write().remove(&approval_id);
                        return format!(
                            "policy_blocked: tool approval timed out after {TOOL_APPROVAL_TIMEOUT_SECS}s"
                        );
                    }
                }
            }
            match execute_tool(state, session_id, call, args_map).await {
                Ok(s) => s,
                Err(e) => format!("tool_error: {e}"),
            }
        }
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

fn is_dangerous_tool(tool_name: &str) -> bool {
    let n = tool_name.to_lowercase();
    n.contains("bash")
        || n.contains("shell")
        || n.contains("command")
        || n.contains("powershell")
        || n.contains("process")
}

async fn execute_tool(
    state: &KernelState,
    _session_id: &str,
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
    } else if call.name == "store_knowledge" {
        let title = args
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Untitled");
        let body = args.get("body").and_then(|v| v.as_str()).unwrap_or("");
        let id = uuid::Uuid::new_v4().to_string();
        let now_ms = chrono::Utc::now().timestamp_millis();
        state.memory.store_knowledge(&id, title, body, now_ms)?;
        return Ok(format!("Knowledge stored successfully with id: {id}"));
    } else if call.name == "forget_knowledge" {
        let entry_id = args
            .get("entry_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| KernelError::Message("forget_knowledge needs entry_id".into()))?;
        let removed = state.memory.forget_knowledge(entry_id)?;
        if removed {
            return Ok(format!("Knowledge '{entry_id}' forgotten."));
        } else {
            return Ok(format!(
                "Knowledge '{entry_id}' not found or already deleted."
            ));
        }
    } else if call.name == "upsert_project_intel" {
        let summary = args.get("summary").and_then(|v| v.as_str()).unwrap_or("");
        let now_ms = chrono::Utc::now().timestamp_millis();
        if let Some(root) = state.workspace_root.as_deref() {
            state.memory.upsert_project_intel(root, summary, now_ms)?;
            return Ok("Project intel updated successfully.".into());
        } else {
            return Err(KernelError::Message(
                "No active workspace to attach project intel to.".into(),
            ));
        }
    } else if call.name == "execute_command" {
        let command = args.get("command").and_then(|v| v.as_str()).unwrap_or("");
        let cwd = args.get("cwd").and_then(|v| v.as_str());

        #[cfg(target_os = "windows")]
        let mut cmd = tokio::process::Command::new("cmd.exe");
        #[cfg(target_os = "windows")]
        cmd.arg("/c").arg(command);

        #[cfg(not(target_os = "windows"))]
        let mut cmd = tokio::process::Command::new("sh");
        #[cfg(not(target_os = "windows"))]
        cmd.arg("-c").arg(command);

        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }

        match tokio::time::timeout(
            Duration::from_secs(EXECUTE_COMMAND_TIMEOUT_SECS),
            cmd.output(),
        )
        .await
        {
            Err(_elapsed) => {
                return Err(KernelError::Message(format!(
                    "command timed out after {EXECUTE_COMMAND_TIMEOUT_SECS} seconds"
                )));
            }
            Ok(Err(e)) => {
                return Err(KernelError::Message(format!(
                    "failed to execute command: {}",
                    e
                )));
            }
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                let mut res = String::new();
                if !stdout.is_empty() {
                    res.push_str(&format!("STDOUT:\n{}\n", stdout));
                }
                if !stderr.is_empty() {
                    res.push_str(&format!("STDERR:\n{}\n", stderr));
                }
                if res.is_empty() {
                    res.push_str("Command executed successfully with no output.");
                }
                if res.len() > EXECUTE_COMMAND_MAX_OUTPUT_BYTES {
                    res.truncate(EXECUTE_COMMAND_MAX_OUTPUT_BYTES);
                    res.push_str("\n[output truncated]");
                }
                return Ok(res);
            }
        }
    } else if call.name == "read_file" {
        let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
        match tokio::fs::read_to_string(path).await {
            Ok(content) => return Ok(content),
            Err(e) => {
                return Err(KernelError::Message(format!(
                    "failed to read file '{}': {}",
                    path, e
                )));
            }
        }
    } else if call.name == "write_file" {
        let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
        let content = args.get("content").and_then(|v| v.as_str()).unwrap_or("");

        let path_obj = std::path::Path::new(path);
        if let Some(parent) = path_obj.parent() {
            if !parent.exists() {
                if let Err(e) = tokio::fs::create_dir_all(parent).await {
                    return Err(KernelError::Message(format!(
                        "failed to create parent directories for '{}': {}",
                        path, e
                    )));
                }
            }
        }

        match tokio::fs::write(path, content).await {
            Ok(_) => return Ok(format!("Successfully wrote to '{}'", path)),
            Err(e) => {
                return Err(KernelError::Message(format!(
                    "failed to write file '{}': {}",
                    path, e
                )));
            }
        }
    } else if call.name == "list_directory" {
        let path = args.get("path").and_then(|v| v.as_str()).unwrap_or("");
        match tokio::fs::read_dir(path).await {
            Ok(mut entries) => {
                let mut result = String::new();
                result.push_str(&format!("Directory listing for '{}':\n", path));
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let file_type = entry.file_type().await.ok();
                    let type_str = if let Some(ft) = file_type {
                        if ft.is_dir() {
                            "[DIR] "
                        } else if ft.is_symlink() {
                            "[LINK]"
                        } else {
                            "[FILE]"
                        }
                    } else {
                        "[?]   "
                    };
                    let name = entry.file_name();
                    result.push_str(&format!("{} {}\n", type_str, name.to_string_lossy()));
                }
                return Ok(result);
            }
            Err(e) => {
                return Err(KernelError::Message(format!(
                    "failed to list directory '{}': {}",
                    path, e
                )));
            }
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    #[test]
    fn resolve_tool_calls_requires_name() {
        let mut acc: ToolCallAccumulator = BTreeMap::new();
        acc.insert(0, (Some("call-1".into()), None, "{}".into()));
        assert!(resolve_tool_calls(&acc).is_err());
    }

    #[test]
    fn resolve_tool_calls_ok_when_name_present() {
        let mut acc: ToolCallAccumulator = BTreeMap::new();
        acc.insert(
            0,
            (
                Some("id-x".into()),
                Some("demo_tool".into()),
                r#"{"a":1}"#.into(),
            ),
        );
        let out = resolve_tool_calls(&acc).unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].name, "demo_tool");
        assert_eq!(out[0].arguments_json, r#"{"a":1}"#);
    }

    #[test]
    fn merge_tool_call_fragments_accumulates_arguments() {
        let mut acc = ToolCallAccumulator::new();
        merge_tool_call_fragments(
            &mut acc,
            vec![ToolCallFragment {
                index: 0,
                id: Some("t1".into()),
                name: Some("f".into()),
                arguments_delta: Some(r#"{"x":"#.into()),
            }],
        );
        merge_tool_call_fragments(
            &mut acc,
            vec![ToolCallFragment {
                index: 0,
                id: None,
                name: None,
                arguments_delta: Some(r#"1}"#.into()),
            }],
        );
        let resolved = resolve_tool_calls(&acc).unwrap();
        assert_eq!(resolved[0].arguments_json, r#"{"x":1}"#);
    }
}
