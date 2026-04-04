//! Tauri 壳层：启动 `z-claw-kernel`，通过 `kernel_send` / `kernel-event` 与前端通信。

use tauri::{AppHandle, Emitter, Manager};
use z_claw_kernel::protocol::UiCommand;
use z_claw_kernel::{spawn_kernel, AppConfig};

#[derive(Clone)]
pub struct KernelBridge {
    pub cmd_tx: crossbeam_channel::Sender<UiCommand>,
}

/// 将 UI 命令送入内核（与原先 GPUI 壳使用同一 [`UiCommand`] 协议）。
#[tauri::command]
fn kernel_send(bridge: tauri::State<KernelBridge>, cmd: UiCommand) -> Result<(), String> {
    bridge
        .cmd_tx
        .send(cmd)
        .map_err(|_| "内核通道已关闭".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle: AppHandle = app.handle().clone();
            let cfg = AppConfig::load_or_default();
            let (cmd_tx, cmd_rx) = crossbeam_channel::unbounded();
            let (event_tx, event_rx) = crossbeam_channel::unbounded();

            let _kernel_jh = spawn_kernel(cfg, cmd_rx, event_tx);

            std::thread::Builder::new()
                .name("z-claw-kernel-events".into())
                .spawn(move || {
                    while let Ok(ev) = event_rx.recv() {
                        if handle.emit("kernel-event", &ev).is_err() {
                            break;
                        }
                    }
                })
                .expect("spawn kernel event bridge");

            app.manage(KernelBridge { cmd_tx });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![kernel_send])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
