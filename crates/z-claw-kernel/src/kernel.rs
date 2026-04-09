use crate::config::AppConfig;
use crate::orchestrator;
use crate::protocol::{KernelEvent, UiCommand};

/// Spawn a background thread running the Tokio kernel loop.
pub fn spawn_kernel(
    cfg: AppConfig,
    cmd_rx: crossbeam_channel::Receiver<UiCommand>,
    event_tx: crossbeam_channel::Sender<KernelEvent>,
) -> std::thread::JoinHandle<()> {
    std::thread::Builder::new()
        .name("z-claw-kernel".into())
        .spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("tokio runtime");
            if let Err(e) = rt.block_on(orchestrator::run_kernel_loop(cfg, cmd_rx, event_tx)) {
                tracing::error!("kernel exit: {e:?}");
            }
        })
        .expect("spawn kernel thread")
}
