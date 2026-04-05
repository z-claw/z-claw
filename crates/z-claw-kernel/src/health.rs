//! OpenClaw-style `doctor`: config path, data dir, provider env/API, MCP servers.

use crate::config::{AppConfig, config_file_path, parse_config_bytes};
use crate::error::Result;
use crate::mcp_pool::McpPool;
use crate::protocol::HealthCheckItem;
use crate::provider::OpenAiCompatibleProvider;
use std::time::{SystemTime, UNIX_EPOCH};

pub async fn collect_health_report(
    cfg: &AppConfig,
    provider: Option<&OpenAiCompatibleProvider>,
    mcp: &McpPool,
) -> Vec<HealthCheckItem> {
    let mut items = vec![];

    let path = config_file_path();
    let path_s = path.display().to_string();
    match std::fs::read(&path) {
        Ok(bytes) => {
            let parsed = parse_config_bytes(&bytes);
            let parse_ok = parsed.is_ok();
            let detail = match &parsed {
                Ok(_) => format!("readable and valid JSON ({path_s})"),
                Err(e) => format!(
                    "JSON parse error ({path_s}): {e}. \
                     If you used Notepad, save as UTF-8 (we strip BOM). \
                     No // comments or trailing commas. See config.example.json."
                ),
            };
            items.push(HealthCheckItem {
                id: "config_file".into(),
                ok: parse_ok,
                detail,
            });
        }
        Err(e) => {
            items.push(HealthCheckItem {
                id: "config_file".into(),
                ok: false,
                detail: format!("cannot read {path_s}: {e}"),
            });
        }
    }

    let pid = cfg
        .default_provider_id
        .as_deref()
        .or(cfg.providers.first().map(|p| p.id.as_str()));
    let prov = pid.and_then(|id| cfg.providers.iter().find(|p| p.id == id));
    if let Some(p) = prov {
        let env_set = std::env::var(&p.api_key_env)
            .ok()
            .is_some_and(|v| !v.trim().is_empty());
        let file_key = p
            .api_key
            .as_ref()
            .is_some_and(|k| !k.trim().is_empty());
        let credential_ok = env_set || file_key;

        let cred_detail = if env_set {
            format!("{} is set (takes precedence over file)", p.api_key_env)
        } else if file_key {
            "using api_key from config file (env not set or empty)".into()
        } else {
            format!(
                "{} not set / empty and no \"api_key\" in config for this provider",
                p.api_key_env
            )
        };
        items.push(HealthCheckItem {
            id: "provider_api_key_env".into(),
            ok: credential_ok,
            detail: cred_detail,
        });

        if credential_ok {
            match provider {
                Some(pr) => match pr.ping_models().await {
                    Ok(msg) => {
                        items.push(HealthCheckItem {
                            id: "provider_api".into(),
                            ok: true,
                            detail: msg,
                        });
                    }
                    Err(e) => {
                        items.push(HealthCheckItem {
                            id: "provider_api".into(),
                            ok: false,
                            detail: e.to_string(),
                        });
                    }
                },
                None => {
                    items.push(HealthCheckItem {
                        id: "provider_api".into(),
                        ok: false,
                        detail: "skipped (provider client not initialized — e.g. missing API key)"
                            .into(),
                    });
                }
            }
        } else {
            items.push(HealthCheckItem {
                id: "provider_api".into(),
                ok: false,
                detail: "skipped (API key env not set)".into(),
            });
        }
    } else {
        items.push(HealthCheckItem {
            id: "provider_config".into(),
            ok: false,
            detail: "no default provider in config".into(),
        });
    }

    let data_dir = cfg.data_dir.clone().unwrap_or_else(|| {
        dirs::config_dir()
            .map(|p| p.join("z-claw").to_string_lossy().to_string())
            .unwrap_or_else(|| ".z-claw".into())
    });
    let base = std::path::PathBuf::from(&data_dir);
    let mem_parent = base.join("memory.sqlite3");
    let parent = mem_parent.parent().unwrap_or(&base);
    let write_ok = std::fs::create_dir_all(parent)
        .and_then(|_| {
            let probe = parent.join(".z_claw_health_probe");
            std::fs::write(&probe, b"ok")?;
            let _ = std::fs::remove_file(&probe);
            Ok(())
        })
        .is_ok();
    items.push(HealthCheckItem {
        id: "data_dir_writable".into(),
        ok: write_ok,
        detail: if write_ok {
            format!("can write under {}", parent.display())
        } else {
            format!("cannot create/write under {}", parent.display())
        },
    });

    match std::env::var("Z_CLAW_WORKSPACE") {
        Ok(v) if !v.trim().is_empty() => {
            let exists = std::path::Path::new(&v).exists();
            items.push(HealthCheckItem {
                id: "workspace_env".into(),
                ok: exists,
                detail: if exists {
                    format!("Z_CLAW_WORKSPACE={v}")
                } else {
                    format!("Z_CLAW_WORKSPACE points to missing path: {v}")
                },
            });
        }
        _ => {
            items.push(HealthCheckItem {
                id: "workspace_env".into(),
                ok: true,
                detail: "Z_CLAW_WORKSPACE not set (optional)".into(),
            });
        }
    }

    for d in &cfg.mcp_servers {
        let res = tokio::time::timeout(
            std::time::Duration::from_secs(12),
            mcp.list_tools_for_server(&d.id),
        )
        .await;
        match res {
            Ok(Ok(tools)) => {
                items.push(HealthCheckItem {
                    id: format!("mcp::{}", d.id),
                    ok: true,
                    detail: format!("{} tools listed", tools.len()),
                });
            }
            Ok(Err(e)) => {
                items.push(HealthCheckItem {
                    id: format!("mcp::{}", d.id),
                    ok: false,
                    detail: e.to_string(),
                });
            }
            Err(_) => {
                items.push(HealthCheckItem {
                    id: format!("mcp::{}", d.id),
                    ok: false,
                    detail: "list_tools timed out (12s)".into(),
                });
            }
        }
    }

    if cfg.mcp_servers.is_empty() {
        items.push(HealthCheckItem {
            id: "mcp_config".into(),
            ok: true,
            detail: "no MCP servers configured".into(),
        });
    }

    items
}

pub fn health_timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Headless CLI: print report as lines.
pub fn format_health_lines(items: &[HealthCheckItem], checked_at_ms: i64) -> String {
    let mut s = format!("z-claw health @ {checked_at_ms} ms\n");
    for it in items {
        let st = if it.ok { "OK" } else { "FAIL" };
        s.push_str(&format!("  [{st}] {} — {}\n", it.id, it.detail));
    }
    s
}

pub async fn run_and_print_health(
    cfg: &AppConfig,
    provider: Option<&OpenAiCompatibleProvider>,
    mcp: &McpPool,
) -> Result<()> {
    let at = health_timestamp_ms();
    let items = collect_health_report(cfg, provider, mcp).await;
    print!("{}", format_health_lines(&items, at));
    let all_ok = items.iter().all(|i| i.ok);
    if all_ok {
        Ok(())
    } else {
        Err(crate::error::KernelError::Message(
            "health check reported failures".into(),
        ))
    }
}
