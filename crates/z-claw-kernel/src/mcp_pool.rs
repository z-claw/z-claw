use crate::config::McpServerDef;
use crate::error::{KernelError, Result};
use crate::provider::ToolDefinition;
use rmcp::model::CallToolRequestParams;
use rmcp::service::ServiceExt;
use rmcp::transport::TokioChildProcess;
use serde_json::{Value, json};
use std::collections::HashMap;
use tokio::process::Command;
use tokio::sync::{RwLock, mpsc, oneshot};
use tokio::time::Duration;
use tracing::error;

enum McpWorkerMsg {
    ListTools(oneshot::Sender<Result<Vec<ToolDefinition>>>),
    CallTool {
        name: String,
        args: serde_json::Map<String, Value>,
        reply: oneshot::Sender<Result<String>>,
    },
    #[allow(dead_code)]
    Shutdown,
}

pub struct McpPool {
    defs: Vec<McpServerDef>,
    workers: RwLock<HashMap<String, mpsc::Sender<McpWorkerMsg>>>,
    tool_cache: RwLock<HashMap<String, Vec<ToolDefinition>>>,
}

impl McpPool {
    pub fn new(defs: Vec<McpServerDef>) -> Self {
        Self {
            defs,
            workers: RwLock::new(HashMap::new()),
            tool_cache: RwLock::new(HashMap::new()),
        }
    }

    pub async fn connect_all_non_lazy(&self) -> Result<()> {
        for d in &self.defs {
            if !d.lazy {
                self.ensure_worker(&d.id).await?;
            }
        }
        Ok(())
    }

    pub async fn refresh_all_tools(&self) -> Result<()> {
        self.tool_cache.write().await.clear();
        for d in &self.defs {
            if d.lazy {
                continue;
            }
            self.load_server_and_cache(&d.id).await?;
        }
        Ok(())
    }

    pub async fn load_server_and_cache(&self, server_id: &str) -> Result<()> {
        let tools = self.list_tools_for_server(server_id).await?;
        self.tool_cache
            .write()
            .await
            .insert(server_id.to_string(), tools);
        Ok(())
    }

    pub async fn deferred_tool_definitions(&self) -> Vec<ToolDefinition> {
        vec![ToolDefinition {
            name: "load_mcp_server".into(),
            description: "Connect a lazy MCP server by id (from config) and refresh its tool list."
                .into(),
            parameters_json: json!({
                "type": "object",
                "properties": {
                    "server_id": { "type": "string", "description": "Configured MCP server id" }
                },
                "required": ["server_id"]
            }),
        }]
    }

    pub async fn all_openai_tools(&self) -> Vec<ToolDefinition> {
        let mut out = self.deferred_tool_definitions().await;
        let cache = self.tool_cache.read().await;
        for (_sid, defs) in cache.iter() {
            out.extend(defs.clone());
        }
        out
    }

    pub async fn ensure_worker(&self, server_id: &str) -> Result<()> {
        let mut map = self.workers.write().await;
        if map.contains_key(server_id) {
            return Ok(());
        }
        let def = self
            .defs
            .iter()
            .find(|s| s.id == server_id)
            .ok_or_else(|| KernelError::Message(format!("unknown MCP server id {server_id}")))?
            .clone();
        let (tx, rx) = mpsc::channel::<McpWorkerMsg>(32);
        tokio::spawn(run_mcp_worker(def, rx));
        map.insert(server_id.to_string(), tx);
        Ok(())
    }

    pub async fn list_tools_for_server(&self, server_id: &str) -> Result<Vec<ToolDefinition>> {
        self.ensure_worker(server_id).await?;
        let tx = {
            let map = self.workers.read().await;
            map.get(server_id)
                .cloned()
                .ok_or_else(|| KernelError::Message("mcp worker missing".into()))?
        };
        let (reply_tx, reply_rx) = oneshot::channel();
        tx.send(McpWorkerMsg::ListTools(reply_tx))
            .await
            .map_err(|_| KernelError::Mcp("mcp worker channel closed".into()))?;
        reply_rx
            .await
            .map_err(|_| KernelError::Mcp("mcp list_tools reply dropped".into()))?
    }

    pub async fn call_on_server(
        &self,
        server_id: &str,
        tool_name: &str,
        args: serde_json::Map<String, Value>,
    ) -> Result<String> {
        tokio::time::timeout(Duration::from_secs(120), async {
            self.ensure_worker(server_id).await?;
            let tx = {
                let map = self.workers.read().await;
                map.get(server_id)
                    .cloned()
                    .ok_or_else(|| KernelError::Message("mcp worker missing".into()))?
            };
            let (reply_tx, reply_rx) = oneshot::channel();
            tx.send(McpWorkerMsg::CallTool {
                name: tool_name.to_string(),
                args,
                reply: reply_tx,
            })
            .await
            .map_err(|_| KernelError::Mcp("mcp worker channel closed".into()))?;
            reply_rx
                .await
                .map_err(|_| KernelError::Mcp("mcp call reply dropped".into()))?
        })
        .await
        .map_err(|_| KernelError::Mcp("mcp call_tool timed out (120s)".into()))?
    }

    pub async fn summarize_tools(&self) -> Vec<crate::protocol::McpServerToolsSummary> {
        let cache = self.tool_cache.read().await;
        cache
            .iter()
            .map(|(sid, defs)| crate::protocol::McpServerToolsSummary {
                server_id: sid.clone(),
                tool_names: defs.iter().map(|d| d.name.clone()).collect(),
            })
            .collect()
    }

    /// Parse composite name `server_id::tool_name` or use default server when unambiguous.
    pub fn parse_tool_target(
        &self,
        flat_name: &str,
        default_server: Option<&str>,
    ) -> Option<(String, String)> {
        if let Some((a, b)) = flat_name.split_once("::") {
            return Some((a.to_string(), b.to_string()));
        }
        default_server.map(|s| (s.to_string(), flat_name.to_string()))
    }
}

async fn run_mcp_worker(def: McpServerDef, mut rx: mpsc::Receiver<McpWorkerMsg>) {
    let mut cmd = Command::new(&def.command);
    cmd.args(&def.args);
    cmd.kill_on_drop(true);
    let transport = match TokioChildProcess::new(cmd) {
        Ok(t) => t,
        Err(e) => {
            error!("mcp transport {}: {e}", def.id);
            return;
        }
    };
    let client = match ().serve(transport).await {
        Ok(c) => c,
        Err(e) => {
            error!("mcp serve {}: {e}", def.id);
            return;
        }
    };
    while let Some(msg) = rx.recv().await {
        match msg {
            McpWorkerMsg::ListTools(reply) => {
                let res = match client.list_all_tools().await {
                    Ok(tools) => {
                        let v: Vec<ToolDefinition> = tools
                            .into_iter()
                            .map(|t| {
                                let prefix = def.tool_namespace_prefix.clone();
                                let name = match &prefix {
                                    Some(p) => format!("{p}{}", t.name),
                                    None => format!("{}::{}", def.id, t.name),
                                };
                                let schema = t.schema_as_json_value();
                                let description = t
                                    .description
                                    .map(|d| d.to_string())
                                    .unwrap_or_default();
                                ToolDefinition {
                                    name,
                                    description,
                                    parameters_json: schema,
                                }
                            })
                            .collect();
                        Ok(v)
                    }
                    Err(e) => Err(KernelError::Mcp(e.to_string())),
                };
                let _ = reply.send(res);
            }
            McpWorkerMsg::CallTool { name, args, reply } => {
                let raw_tool = if let Some(prefix) = &def.tool_namespace_prefix {
                    name.strip_prefix(prefix).unwrap_or(&name).to_string()
                } else if let Some((_sid, rest)) = name.split_once("::") {
                    rest.to_string()
                } else {
                    name.clone()
                };
                let params = CallToolRequestParams::new(raw_tool).with_arguments(args);
                let res = match client.call_tool(params).await {
                    Ok(out) => Ok(format!("{out:?}")),
                    Err(e) => Err(KernelError::Mcp(e.to_string())),
                };
                let _ = reply.send(res);
            }
            McpWorkerMsg::Shutdown => break,
        }
    }
    let _ = client.cancel().await;
}
