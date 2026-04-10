mod delegate;
mod swarm;
mod turn;

use crate::config::{AppConfig, reload_from_disk, snapshot_for_ui};
use crate::error::{KernelError, Result};
use crate::mcp_pool::McpPool;
use crate::memory::MemoryEngine;
use crate::multi_agent::AgentMessageBus;
use crate::policy::PolicyEngine;
use crate::protocol::{HistoryMessage, KernelEvent, PolicyBlockCode, SessionSummary, UiCommand};
use crate::provider::OpenAiCompatibleProvider;
use crate::scheduler::JobScheduler;
use delegate::{queue_delegate_command, start_delegate_worker_loop};
use parking_lot::RwLock;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use swarm::run_swarm_command;
use turn::{emit_mcp_summary, run_model_turn};
use uuid::Uuid;
use crate::workspace::WorkspaceManager;

/// 可从磁盘热重载的字段（见 `GetConfigSnapshot` / `try_reload_runtime_from_disk`）。
pub struct RuntimeSettings {
    pub cfg: AppConfig,
    pub llm_routing: Vec<(Arc<OpenAiCompatibleProvider>, String)>,
    pub llm_routing_provider_ids: Vec<String>,
    pub default_mcp_server: Option<String>,
}

pub struct KernelState {
    pub runtime: RwLock<RuntimeSettings>,
    pub memory: MemoryEngine,
    pub scheduler: JobScheduler,
    pub policy: PolicyEngine,
    pub mcp: Arc<McpPool>,
    pub bus: AgentMessageBus,
    pub workspace_manager: WorkspaceManager,
    pub active_agent_id: RwLock<String>,
    pub pending_approvals: RwLock<HashMap<String, tokio::sync::oneshot::Sender<bool>>>,
    pub event_tx: crossbeam_channel::Sender<KernelEvent>,
    pub workspace_root: Option<String>,
}

pub(super) fn try_reload_runtime_from_disk(state: &KernelState) -> Result<()> {
    let new_cfg = reload_from_disk()?;
    let (routing, ids) = resolve_llm_routing(&new_cfg)?;
    let dmc = new_cfg.mcp_servers.first().map(|s| s.id.clone());
    let primary_base = new_cfg
        .default_provider_id
        .as_deref()
        .or(new_cfg.providers.first().map(|p| p.id.as_str()))
        .and_then(|pid| new_cfg.providers.iter().find(|p| p.id == pid).map(|p| p.base_url.clone()));
    {
        let mut w = state.runtime.write();
        w.cfg = new_cfg.clone();
        w.llm_routing = routing;
        w.llm_routing_provider_ids = ids;
        w.default_mcp_server = dmc;
    }
    state.policy.replace_cfg(new_cfg.policy);
    tracing::info!(
        path = %crate::config::config_file_path().display(),
        ?primary_base,
        "config hot-reload applied"
    );
    Ok(())
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

    let (llm_routing, llm_routing_provider_ids) = resolve_llm_routing(&cfg)?;
    let default_mcp_server = cfg.mcp_servers.first().map(|s| s.id.clone());
    let runtime = RwLock::new(RuntimeSettings {
        cfg: cfg.clone(),
        llm_routing,
        llm_routing_provider_ids,
        default_mcp_server,
    });

    let workspace_manager = WorkspaceManager::new(&base);

    let state = Arc::new(KernelState {
        runtime,
        memory,
        scheduler,
        policy,
        mcp,
        bus,
        workspace_manager,
        active_agent_id: RwLock::new("DefaultAgent".to_string()),
        pending_approvals: RwLock::new(HashMap::new()),
        event_tx: event_tx.clone(),
        workspace_root: std::env::var("Z_CLAW_WORKSPACE").ok(),
    });

    start_delegate_worker_loop(state.clone());

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

/// 主提供商 + `routing.fallback_chain` 去重后的顺序；无密钥的备用在启动时跳过，主提供商密钥缺失则报错。
pub fn resolve_llm_routing(
    cfg: &AppConfig,
) -> Result<(
    Vec<(Arc<OpenAiCompatibleProvider>, String)>,
    Vec<String>,
)> {
    let primary_id = cfg
        .default_provider_id
        .as_deref()
        .or(cfg.providers.first().map(|p| p.id.as_str()))
        .ok_or_else(|| KernelError::Message("no provider in config".into()))?;

    let mut ordered_ids: Vec<String> = vec![];
    let mut push_id = |id: &str| {
        if !ordered_ids.iter().any(|x| x == id) {
            ordered_ids.push(id.to_string());
        }
    };
    push_id(primary_id);
    for sid in &cfg.routing.fallback_chain {
        if cfg.providers.iter().any(|p| p.id == *sid) {
            push_id(sid);
        } else {
            tracing::warn!(
                "routing.fallback_chain: unknown provider id {:?}, skipping",
                sid
            );
        }
    }

    let mut chain = Vec::with_capacity(ordered_ids.len());
    let mut ids_out = Vec::with_capacity(ordered_ids.len());
    for (i, id) in ordered_ids.iter().enumerate() {
        let p = cfg
            .providers
            .iter()
            .find(|x| x.id == *id)
            .expect("ordered_ids only contains known providers");
        let key = match crate::config::resolve_provider_api_key(p) {
            Ok(k) => k,
            Err(e) => {
                if i == 0 {
                    return Err(e);
                }
                tracing::warn!(
                    "routing: skip provider {} (no credentials: {})",
                    id,
                    e
                );
                continue;
            }
        };
        let model = cfg
            .default_model
            .clone()
            .or(p.default_model.clone())
            .ok_or_else(|| KernelError::Message(format!("no default_model for provider {id}")))?;
        chain.push((
            Arc::new(OpenAiCompatibleProvider::new(&p.base_url, key)),
            model,
        ));
        ids_out.push(id.clone());
    }

    if chain.is_empty() {
        return Err(KernelError::Message(
            "no usable LLM provider after resolving routing (check API keys)".into(),
        ));
    }
    Ok((chain, ids_out))
}

pub(super) fn classify_policy_denial(message: &str) -> PolicyBlockCode {
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
            let active = state.active_agent_id.read().clone();
            let id = Uuid::new_v4().to_string();
            let title = title.unwrap_or_else(|| "New session".into());
            let now = chrono::Utc::now().timestamp_millis();
            state.memory.upsert_session(&id, &title, &active, now)?;
            let _ = state
                .event_tx
                .send(KernelEvent::SessionCreated { id, title });
        }
        UiCommand::ListSessions => {
            let active = state.active_agent_id.read().clone();
            let rows = state.memory.list_sessions(&active)?;
            let sessions = rows
                .into_iter()
                .map(|(id, title, updated_at_ms)| SessionSummary {
                    id,
                    title,
                    updated_at_ms,
                })
                .collect();
            let _ = state.event_tx.send(KernelEvent::SessionsList { sessions });
        }
        UiCommand::LoadSessionHistory {
            session_id,
            limit,
            client_request_id,
        } => {
            let cap = limit.clamp(1, 500);
            let rows = state.memory.load_recent_messages(&session_id, cap)?;
            let messages = rows
                .into_iter()
                .map(|(role, content)| HistoryMessage { role, content })
                .collect();
            let _ = state.event_tx.send(KernelEvent::SessionHistoryLoaded {
                session_id,
                client_request_id,
                messages,
            });
        }
        UiCommand::RenameSession { session_id, title } => {
            let now = chrono::Utc::now().timestamp_millis();
            state.memory.rename_session(&session_id, &title, now)?;
            let _ = state
                .event_tx
                .send(KernelEvent::SessionRenamed { session_id, title });
        }
        UiCommand::DeleteSession { session_id } => {
            state.memory.delete_session(&session_id)?;
            let _ = state
                .event_tx
                .send(KernelEvent::SessionDeleted { session_id });
        }
        UiCommand::GetConfigSnapshot => {
            let reload_err = try_reload_runtime_from_disk(state).err().map(|e| e.to_string());
            let rt = state.runtime.read();
            let mut snapshot = snapshot_for_ui(&rt.cfg);
            if let Some(obj) = snapshot.as_object_mut() {
                let primary_model = rt
                    .llm_routing
                    .first()
                    .map(|(_, m)| m.clone())
                    .unwrap_or_default();
                let mut runtime_v = json!({
                    "model": primary_model,
                    "llm_routing_provider_ids": rt.llm_routing_provider_ids,
                    "workspace_root": state.workspace_root,
                    "default_mcp_server": rt.default_mcp_server,
                });
                if let Some(e) = reload_err {
                    if let Some(m) = runtime_v.as_object_mut() {
                        m.insert("config_reload_error".into(), json!(e));
                    }
                }
                obj.insert("runtime".to_string(), runtime_v);
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
            state
                .memory
                .append_message(&mid, &session_id, "user", &content, now)?;
            run_model_turn(state, &session_id, &content, false).await?;
        }
        UiCommand::RefreshMcpTools => {
            state.mcp.refresh_all_tools().await?;
            emit_mcp_summary(state).await?;
        }
        UiCommand::RunHealthCheck => {
            let (cfg_for_health, primary_client) = {
                let rt = state.runtime.read();
                (
                    rt.cfg.clone(),
                    rt.llm_routing.first().map(|(p, _)| Arc::clone(p)),
                )
            };
            let primary = primary_client.as_ref().map(|a| a.as_ref());
            let items = crate::health::collect_health_report(
                &cfg_for_health,
                primary,
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
            let _ = state
                .event_tx
                .send(KernelEvent::ScheduleJobAdded { job_id: id });
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
                .map(|(id, cron_expr, timezone, enabled, prompt)| {
                    crate::protocol::ScheduledJobSummary {
                        id,
                        cron_expr,
                        timezone,
                        enabled,
                        prompt_preview: prompt.chars().take(120).collect(),
                    }
                })
                .collect();
            let _ = state.event_tx.send(KernelEvent::ScheduleList { jobs });
        }
        UiCommand::RunSwarm { session_id, tasks } => {
            run_swarm_command(state, session_id, tasks).await
        }
        UiCommand::Delegate {
            session_id,
            target_agent_id,
            instruction,
        } => queue_delegate_command(state, session_id, target_agent_id, instruction),
        UiCommand::MemoryRecall {
            session_id,
            query,
            budget_tokens,
        } => {
            let max_recall = state.runtime.read().cfg.memory.max_recall_budget_tokens;
            let snippets = state.memory.recall(
                &session_id,
                state.workspace_root.as_deref(),
                &query,
                budget_tokens,
                max_recall,
            )?;
            let _ = state.event_tx.send(KernelEvent::MemoryRecalled {
                session_id,
                snippets,
            });
        }
        UiCommand::MemoryForget { entry_id } => {
            let removed = state.memory.forget_knowledge(&entry_id)?;
            let _ = state.event_tx.send(KernelEvent::MemoryForgotten {
                entry_id,
                removed,
            });
        }
        UiCommand::RespondToolApproval { approval_id, approved } => {
            if let Some(tx) = state.pending_approvals.write().remove(&approval_id) {
                let _ = tx.send(approved);
            } else {
                tracing::warn!("RespondToolApproval: no pending approval found for {}", approval_id);
            }
        }
        UiCommand::ListAgents => {
            let agents = state.workspace_manager.list_agents().unwrap_or_default();
            let active = state.active_agent_id.read().clone();
            let _ = state.event_tx.send(KernelEvent::AgentsList { agents, active });
        }
        UiCommand::SetActiveAgent { agent_id } => {
            match state.workspace_manager.load_agent_profile(&agent_id) {
                Ok(_) => {
                    *state.active_agent_id.write() = agent_id.clone();

                    let agents = state.workspace_manager.list_agents().unwrap_or_default();
                    let active = state.active_agent_id.read().clone();
                    let _ = state.event_tx.send(KernelEvent::AgentsList {
                        agents,
                        active: active.clone(),
                    });

                    let rows = state.memory.list_sessions(&active).unwrap_or_default();
                    let sessions = rows
                        .into_iter()
                        .map(|(id, title, updated_at_ms)| SessionSummary {
                            id,
                            title,
                            updated_at_ms,
                        })
                        .collect();
                    let _ = state.event_tx.send(KernelEvent::SessionsList { sessions });
                }
                Err(e) => {
                    let _ = state.event_tx.send(KernelEvent::Error {
                        message: format!("无法切换到智能体 {agent_id}: {e}"),
                    });
                }
            }
        }
        UiCommand::CreateAgentProfile { agent_id } => {
            if state.workspace_manager.create_agent_profile(&agent_id).is_ok() {
                *state.active_agent_id.write() = agent_id;
                
                let agents = state.workspace_manager.list_agents().unwrap_or_default();
                let active = state.active_agent_id.read().clone();
                let _ = state.event_tx.send(KernelEvent::AgentsList { agents, active });
            }
        }
        UiCommand::LoadAgentProfile {
            agent_id,
            client_request_id,
        } => {
            match state.workspace_manager.load_agent_profile(&agent_id) {
                Ok(p) => {
                    let _ = state.event_tx.send(KernelEvent::AgentProfileLoaded {
                        agent_id,
                        identity_markdown: p.identity_prompt,
                        memory_markdown: p.memory_text,
                        client_request_id,
                    });
                }
                Err(e) => {
                    let _ = state.event_tx.send(KernelEvent::AgentProfileLoadFailed {
                        agent_id,
                        message: e.to_string(),
                        client_request_id,
                    });
                }
            }
        }
        UiCommand::SaveAgentProfile {
            agent_id,
            identity_markdown,
            memory_markdown,
        } => {
            state.workspace_manager.save_agent_profile(
                &agent_id,
                &identity_markdown,
                &memory_markdown,
            )?;
            let _ = state.event_tx.send(KernelEvent::AgentProfileSaved { agent_id });
        }
    }
    Ok(())
}
