# z-claw

本地 AI Agent 桌面应用

## 仓库结构

- `apps/desktop`：Tauri 2 + Vite + React 桌面壳，经 `kernel_send` 与内核通信
- `crates/z-claw-kernel`：Rust 内核（会话、工具、工作区智能体档案等）
- `packages/ui`：共享 UI（shadcn 风格组件）
- `openspec/`：OpenSpec 规格；项目级上下文见 [`openspec/config.yaml`](openspec/config.yaml)

## OpenSpec

生成提案与任务时，AI 应读取 `openspec/config.yaml` 中的 `context` 与 `rules`，并与本 README 的目录约定保持一致。
