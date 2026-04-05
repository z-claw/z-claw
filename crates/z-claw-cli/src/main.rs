//! 无头入口：只运行内核，将 [`KernelEvent`] 打到 stderr（适合 CI、脚本或不需要窗口的环境）。
//! 桌面版请使用 Tauri 应用 `z-claw`。
//!
//! 子命令：`doctor` — 一次性健康检查（配置、数据目录、Provider、MCP），不启动常驻内核。

use std::sync::Arc;
use tracing_subscriber::EnvFilter;
use z_claw_kernel::mcp_pool::McpPool;
use z_claw_kernel::protocol::KernelEvent;
use z_claw_kernel::{AppConfig, spawn_kernel};

async fn run_doctor() -> z_claw_kernel::Result<()> {
    let cfg = AppConfig::load_or_default();
    let mcp = Arc::new(McpPool::new(cfg.mcp_servers.clone()));
    let _ = mcp.connect_all_non_lazy().await;
    let provider_opt = z_claw_kernel::orchestrator::resolve_llm_routing(&cfg)
        .ok()
        .and_then(|(chain, _)| chain.into_iter().next().map(|(p, _)| p));
    let provider_ref = provider_opt.as_ref().map(|a| a.as_ref());
    z_claw_kernel::health::run_and_print_health(&cfg, provider_ref, mcp.as_ref()).await
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let mut args = std::env::args();
    let _ = args.next();
    if args.next().as_deref() == Some("doctor") {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("tokio runtime");
        if let Err(e) = rt.block_on(run_doctor()) {
            eprintln!("doctor: {e}");
            std::process::exit(1);
        }
        return;
    }

    let cfg = AppConfig::load_or_default();
    let (cmd_tx, cmd_rx) = crossbeam_channel::unbounded();
    let (event_tx, event_rx) = crossbeam_channel::unbounded();

    let _kernel = spawn_kernel(cfg, cmd_rx, event_tx);
    let _keep_cmd_channel = cmd_tx;

    tracing::info!("z-claw-cli: headless kernel; printing events (Ctrl+C to exit).");
    tracing::info!("Run `z-claw-cli doctor` for a one-shot health check.");

    while let Ok(ev) = event_rx.recv() {
        match ev {
            KernelEvent::MessageDelta { delta, .. } => print!("{delta}"),
            other => eprintln!("{other:?}"),
        }
    }
}
