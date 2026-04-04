//! 无头入口：只运行内核，将 [`KernelEvent`] 打到 stderr（适合 CI、脚本或不需要窗口的环境）。
//! 桌面版请使用 **`z-claw`**（GPUI）。

use tracing_subscriber::EnvFilter;
use z_claw_kernel::protocol::KernelEvent;
use z_claw_kernel::{AppConfig, spawn_kernel};

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let cfg = AppConfig::load_or_default();
    let (cmd_tx, cmd_rx) = crossbeam_channel::unbounded();
    let (event_tx, event_rx) = crossbeam_channel::unbounded();

    let _kernel = spawn_kernel(cfg, cmd_rx, event_tx);
    let _keep_cmd_channel = cmd_tx;

    tracing::info!("z-claw-cli: headless kernel; printing events (Ctrl+C to exit).");
    tracing::info!("For the desktop app, run `z-claw`.");

    while let Ok(ev) = event_rx.recv() {
        match ev {
            KernelEvent::MessageDelta { delta, .. } => print!("{delta}"),
            other => eprintln!("{other:?}"),
        }
    }
}
