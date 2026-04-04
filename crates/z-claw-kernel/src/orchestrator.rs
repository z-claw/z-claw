use crate::config::{snapshot_for_ui, AppConfig};
use crate::error::{KernelError, Result};
use crate::memory::MemoryEngine;
use crate::mcp_pool::McpPool;
use crate::multi_agent::{self, AgentMessageBus, MergeStrategy};
use crate::policy::PolicyEngine;
use crate::provider::{
    ChatMessage, ChatProvider, ChatRequest, OpenAiCompatibleProvider, ResolvedToolCall,
    ToolDefinition,
};
use crate::protocol::{
    KernelEvent, PolicyBlockCode, SessionSummary, SwarmSubTask, UiCommand,
};
use crate::scheduler::JobScheduler;
use futures_util::StreamExt;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::sync::Arc;
use uuid::Uuid;

pub struct KernelState {
    pub cfg: AppConfig,
    pub memory: MemoryEngine,
    pub scheduler: JobScheduler,
    pub policy: PolicyEngine,
    pub mcp: Arc<McpPool>,
    pub bus: AgentMessageBus,
    pub provider: Arc<OpenAiCompatibleProvider>,
    pub model: String,
    pub event_tx: crossbeam_channel::Sender<KernelEvent>,
    pub workspace_root: Option<String>,
    pub default_mcp_server: Option<String>,
}

pub async fn run_kernel_loop(
    cfg: AppConfig,
    cmd_rx: crossbeam_channel::Receiver<UiCommand>,
    event_tx: crossbeam_channel::Sender<KernelEvent>,
) -> Result<()> {
    let (bridge_tx, mut bridge_rx) = tokio::sync::mpsc::channel::<UiCommand>(128);
    std::thread::spawn(move || {
        while let Ok(c) = cmd_rx.recv() {
            if bridge_tx.blocking_send(c).is_err() {
                break;
            }
        }
    });

    let data_dir = cfg.data_dir.clone().unwrap_or_else(|| {
        dirs::config_dir()
            .map(|p| p.join("z-claw").to_string_lossy().to_string())
            .unwrap_or_else(|| ".z-claw".into())
    });
    let base = std::path::PathBuf::from(&data_dir);
    let memory = MemoryEngine::open(&base.join("memory.sqlite3"))?;
    let scheduler = JobScheduler::open(&base.join("scheduler.sqlite3"))?;
    let policy = PolicyEngine::new(cfg.policy.clone());
    let mcp = Arc::new(McpPool::new(cfg.mcp_servers.clone()));
    let _ = mcp.connect_all_non_lazy().await;
    let _ = mcp.refresh_all_tools().await;
    let bus = AgentMessageBus::new(256);

    let (provider, model) = resolve_provider_and_model(&cfg)?;
    let default_mcp_server = cfg.mcp_servers.first().map(|s| s.id.clone());

    let state = Arc::new(KernelState {
        cfg: cfg.clone(),
        memory,
        scheduler,
        policy,
        mcp,
        bus,
        provider,
        model,
        event_tx: event_tx.clone(),
        workspace_root: std::env::var("Z_CLAW_WORKSPACE").ok(),
        default_mcp_server,
    });

    let _ = event_tx.send(KernelEvent::Ready);

    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(1));

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                let now = chrono::Utc::now().timestamp_millis();
                let due = match state.scheduler.due_jobs(now) {
                    Ok(d) => d,
                    Err(e) => {
                        tracing::warn!("scheduler tick: {e:?}");
                        continue;
                    }
                };
                for job_id in due {
                    if let Ok(Some((prompt, target))) = state.scheduler.job_payload(&job_id) {
                        let sid = target.unwrap_or_else(|| "scheduled".into());
                        if let Err(e) = run_model_turn(&state, &sid, &prompt, true).await {
                            let _ = event_tx.send(KernelEvent::Error { message: e.to_string() });
                        }
                        let _ = state.scheduler.mark_fired(&job_id, now);
                    }
                }
                for record in state.policy.drain_audit(8) {
                    let _ = event_tx.send(KernelEvent::AuditEntry { record });
                }
            }
            cmd = bridge_rx.recv() => {
                let Some(cmd) = cmd else { break };
                if let Err(e) = handle_command(&state, cmd).await {
                    let _ = event_tx.send(KernelEvent::Error { message: e.to_string() });
                }
            }
        }
    }
    Ok(())
}

pub fn resolve_provider_and_model(cfg: &AppConfig) -> Result<(Arc<OpenAiCompatibleProvider>, String)> {
    let pid = cfg
        .default_provider_id
        .as_deref()
        .or(cfg.providers.first().map(|p| p.id.as_str()))
        .ok_or_else(|| KernelError::Message("no provider in config".into()))?;
    let p = cfg
        .providers
        .iter()
        .find(|x| x.id == pid)
        .ok_or_else(|| KernelError::Message(format!("provider {pid} not found")))?;
    let key = std::env::var(&p.api_key_env).map_err(|_| {
        KernelError::Message(format!("set environment variable {}", p.api_key_env))
    })?;
    let model = cfg
        .default_model
        .clone()
        .or(p.default_model.clone())
        .ok_or_else(|| KernelError::Message("no default_model".into()))?;
    Ok((
        Arc::new(OpenAiCompatibleProvider::new(&p.base_url, key)),
        model,
    ))
}

fn classify_policy_denial(message: &str) -> PolicyBlockCode {
    if message.contains("tool blocked by policy") {
        PolicyBlockCode::ToolBlocked
    } else if message.contains("path not under allowed prefix") {
        PolicyBlockCode::PathNotAllowed
    } else if message.contains("schedule")
        || message.contains("empty schedule prompt")
        || message.contains("interval")
    {
        PolicyBlockCode::ScheduleDenied
    } else {
        PolicyBlockCode::Other
    }
}

async fn handle_command(state: &Arc<KernelState>, cmd: UiCommand) -> Result<()> {
    match cmd {
        UiCommand::Shutdown => std::process::exit(0),
        UiCommand::CreateSession { title } => {
            let id = Uuid::new_v4().to_string();
            let title = title.unwrap_or_else(|| "New session".into());
            let now = chrono::Utc::now().timestamp_millis();
            state.memory.upsert_session(&id, &title, now)?;
            let _ = state
                .event_tx
                .send(KernelEvent::SessionCreated { id, title });
        }
        UiCommand::ListSessions => {
            let rows = state.memory.list_sessions()?;
            let sessions = rows
                .into_iter()
                .map(|(id, title, updated_at_ms)| SessionSummary {
                    id,
                    title,
                    updated_at_ms,
                })
                .collect();
            let _ = state
                .event_tx
                .send(KernelEvent::SessionsList { sessions });
        }
        UiCommand::GetConfigSnapshot => {
            let mut snapshot = snapshot_for_ui(&state.cfg);
            if let Some(obj) = snapshot.as_object_mut() {
                obj.insert(
                    "runtime".to_string(),
                    json!({
                        "model": state.model,
                        "workspace_root": state.workspace_root,
                        "default_mcp_server": state.default_mcp_server,
                    }),
                );
            }
            let _ = state
                .event_tx
                .send(KernelEvent::ConfigSnapshot { snapshot });
        }
        UiCommand::SendMessage {
            session_id,
            content,
        } => {
            let now = chrono::Utc::now().timestamp_millis();
            let mid = Uuid::new_v4().to_string();
            state.memory.append_message(
                &mid,
                &session_id,
                "user",
                &content,
                now,
            )?;
            run_model_turn(state, &session_id, &content, false).await?;
        }
        UiCommand::RefreshMcpTools => {
            state.mcp.refresh_all_tools().await?;
            emit_mcp_summary(state).await?;
        }
        UiCommand::RunHealthCheck => {
            let items = crate::health::collect_health_report(
                &state.cfg,
                Some(state.provider.as_ref()),
                state.mcp.as_ref(),
            )
            .await;
            let _ = state.event_tx.send(KernelEvent::HealthReport {
                checked_at_ms: crate::health::health_timestamp_ms(),
                items,
            });
        }
        UiCommand::ScheduleAdd {
            cron_expr,
            timezone,
            payload,
        } => {
            state
                .policy
                .validate_schedule_proposal(&cron_expr, &payload)?;
            let id = Uuid::new_v4().to_string();
            state
                .scheduler
                .add_job(&id, &cron_expr, &timezone, &payload)?;
            let _ = state.event_tx.send(KernelEvent::ScheduleJobAdded { job_id: id });
        }
        UiCommand::ScheduleRemove { job_id } => {
            state.scheduler.remove_job(&job_id)?;
            let _ = state
                .event_tx
                .send(KernelEvent::ScheduleJobRemoved { job_id });
        }
        UiCommand::ScheduleList => {
            let rows = state.scheduler.list_jobs()?;
            let jobs = rows
                .into_iter()
                .map(
                    |(id, cron_expr, timezone, enabled, prompt)| {
                        crate::protocol::ScheduledJobSummary {
                            id,
                            cron_expr,
                            timezone,
                            enabled,
                            prompt_preview: prompt.chars().take(120).collect(),
                        }
                    },
                )
                .collect();
            let _ = state.event_tx.send(KernelEvent::ScheduleList { jobs });
        }
        UiCommand::RunSwarm {
            session_id,
            tasks,
        } => {
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
            let _ = state.event_tx.send(KernelEvent::SwarmMerged {
                session_id,
                text: merged,
            });
        }
        UiCommand::Delegate {
            session_id,
            target_agent_id,
            instruction,
        } => {
            let task = multi_agent::new_delegate_task(
                session_id.clone(),
                target_agent_id.clone(),
                instruction,
            );
            let tid = task.task_id.clone();
            state.bus.publish(task);
            let _ = state.event_tx.send(KernelEvent::DelegateQueued {
                session_id,
                target_agent_id,
                task_id: tid,
            });
        }
        UiCommand::MemoryRecall {
            session_id,
            query,
            budget_tokens,
        } => {
            let snippets = state.memory.recall(
                &session_id,
                state.workspace_root.as_deref(),
                &query,
                budget_tokens,
                state.cfg.memory.max_recall_budget_tokens,
            )?;
            let _ = state.event_tx.send(KernelEvent::MemoryRecalled {
                session_id,
                snippets,
            });
        }
        UiCommand::MemoryForget { entry_id } => {
            state.memory.forget_knowledge(&entry_id)?;
        }
    }
    Ok(())
}

async fn run_swarm_worker(state: &KernelState, instruction: &str) -> Result<String> {
    let recall = state.memory.recall(
        "swarm",
        state.workspace_root.as_deref(),
        instruction,
        1024,
        state.cfg.memory.max_recall_budget_tokens,
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
    let tools: Vec<ToolDefinition> = vec![];
    let req = ChatRequest {
        model: state.model.clone(),
        messages,
        tools,
        stream: false,
    };
    let mut stream = state.provider.chat_stream(req).await?;
    let mut text = String::new();
    while let Some(ch) = stream.next().await {
        let ch = ch?;
        if let Some(d) = ch.content_delta {
            text.push_str(&d);
        }
    }
    Ok(text)
}

async fn emit_mcp_summary(state: &KernelState) -> Result<()> {
    let servers = state.mcp.summarize_tools().await;
    let _ = state
        .event_tx
        .send(KernelEvent::McpToolsUpdated { servers });
    Ok(())
}

async fn run_model_turn(
    state: &KernelState,
    session_id: &str,
    _user_line: &str,
    _from_schedule: bool,
) -> Result<()> {
    let recall = state.memory.recall(
        session_id,
        state.workspace_root.as_deref(),
        "",
        2048,
        state.cfg.memory.max_recall_budget_tokens,
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

    for _round in 0..8 {
        let req = ChatRequest {
            model: state.model.clone(),
            messages: messages.clone(),
            tools: tools.clone(),
            stream: true,
        };
        let mut stream = state.provider.chat_stream(req).await?;
        let mut assistant_text = String::new();
        let mut acc: BTreeMap<usize, (Option<String>, Option<String>, String)> = BTreeMap::new();
        let mut finish: Option<String> = None;
        while let Some(item) = stream.next().await {
            let ch = item?;
            if let Some(d) = ch.content_delta {
                assistant_text.push_str(&d);
                let _ = state.event_tx.send(KernelEvent::MessageDelta {
                    session_id: session_id.to_string(),
                    role: "assistant".into(),
                    delta: d,
                });
            }
            for frag in ch.tool_calls_delta {
                let e = acc
                    .entry(frag.index)
                    .or_insert((None, None, String::new()));
                if let Some(id) = frag.id {
                    e.0 = Some(id);
                }
                if let Some(n) = frag.name {
                    e.1 = Some(n);
                }
                if let Some(a) = frag.arguments_delta {
                    e.2.push_str(&a);
                }
            }
            if let Some(fr) = ch.finish_reason.clone() {
                finish = Some(fr);
            }
        }

        if acc.is_empty() {
            let now = chrono::Utc::now().timestamp_millis();
            let mid = Uuid::new_v4().to_string();
            state.memory.append_message(
                &mid,
                session_id,
                "assistant",
                &assistant_text,
                now,
            )?;
            let _ = state.memory.maybe_compact_session(
                session_id,
                state.cfg.memory.compaction_enabled,
                state.cfg.memory.compaction_message_threshold,
                state.cfg.memory.compaction_keep_recent,
                state.cfg.memory.compaction_summary_max_chars,
            );
            let _ = state.event_tx.send(KernelEvent::MessageComplete {
                session_id: session_id.to_string(),
                role: "assistant".into(),
                full_text: assistant_text,
            });
            return Ok(());
        }

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

        messages.push(ChatMessage {
            role: "assistant".into(),
            content: assistant_text.clone(),
            tool_calls: Some(json!(tool_calls_json)),
            tool_call_id: None,
        });

        let resolved = resolve_tool_calls(&acc)?;
        for call in resolved {
            let _ = state.event_tx.send(KernelEvent::ToolCallStarted {
                session_id: session_id.to_string(),
                tool_name: call.name.clone(),
            });
            let args_val: Value = serde_json::from_str(&call.arguments_json).unwrap_or(json!({}));
            let args_map = args_val
                .as_object()
                .cloned()
                .unwrap_or_default();
            let policy_check = state.policy.validate_tool_call(&call.name, &args_val);
            let result = match policy_check {
                Err(e) => {
                    let (code, message) = match &e {
                        KernelError::PolicyDenied(msg) => {
                            (classify_policy_denial(msg), msg.clone())
                        }
                        _ => (PolicyBlockCode::Other, e.to_string()),
                    };
                    let _ = state.event_tx.send(KernelEvent::PolicyBlocked { code, message });
                    format!("policy_blocked: {e}")
                }
                Ok(()) => match execute_tool(state, &call, args_map).await {
                    Ok(s) => s,
                    Err(e) => format!("tool_error: {e}"),
                },
            };
            let _ = state.event_tx.send(KernelEvent::ToolCallFinished {
                session_id: session_id.to_string(),
                tool_name: call.name.clone(),
                ok: !result.starts_with("policy_blocked") && !result.starts_with("tool_error"),
                summary: result.chars().take(200).collect(),
            });
            messages.push(ChatMessage::tool(call.id, result));
        }

        if finish.as_deref() == Some("stop") {
            continue;
        }
    }
    Ok(())
}

fn resolve_tool_calls(
    acc: &BTreeMap<usize, (Option<String>, Option<String>, String)>,
) -> Result<Vec<ResolvedToolCall>> {
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
    } else if let Some(d) = state.default_mcp_server.clone() {
        (d, call.name.clone())
    } else {
        return Err(KernelError::Message(format!(
            "cannot route tool {} (set MCP server or use server::tool)",
            call.name
        )));
    };

    state
        .mcp
        .call_on_server(&server_id, &tool_name, args)
        .await
}
