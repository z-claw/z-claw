# z-claw

本地 AI Agent 桌面应用

## 仓库结构

- `apps/desktop`：Tauri 2 + Vite + React 桌面壳，经 `kernel_send` 与内核通信
- `crates/z-claw-kernel`：Rust 内核（会话、工具、工作区智能体档案等）
- `packages/ui`：共享 UI（shadcn 风格组件）
- `openspec/`：OpenSpec 规格；项目级上下文见 `[openspec/config.yaml](openspec/config.yaml)`

## OpenSpec

生成提案与任务时，AI 应读取 `openspec/config.yaml` 中的 `context` 与 `rules`，并与本 README 的目录约定保持一致。

## Roadmap Issue 与实现核对

以下对应 `z-claw/z-claw` 中历史 Roadmap Issue（#3–#11），便于人工与 CI 对照；**以代码为准**，若与 Issue 标题不一致请以本节为准。

| 主题 | Issue | 实现状态 | 说明 |
|------|-------|----------|------|
| 应用内编辑智能体档案 | #3 | 已落地 | `AgentProfileSheet`、`LoadAgentProfile` / `SaveAgentProfile`（内核 `workspace.rs`） |
| Delegate 载入目标人格 | #4 | 已落地 | `orchestrator/delegate.rs` 中 `load_agent_profile(target)` 注入 IDENTITY/MEMORY |
| CreateAgentProfile 错误可见 | #5 | 已落地 | `orchestrator.rs` 失败分支发送 `KernelEvent::Error` |
| 配置可视化 | #6 | 部分 | 设置中为结构化只读 + 路径提示（`SettingsDrawer`、`config-snapshot-view`）；写回仍依赖编辑磁盘 `config.json` |
| 会话检索 / 跨会话搜索 | #7 | 未落地 | 内核与桌面暂无检索 API / UI |
| 桌面单元 / E2E 测试 | #8 | 部分 | `apps/desktop` 已配置 `pnpm test`（Vitest）与 `src/lib/transcript.test.ts`；E2E 未接 |
| 对话区结构化展示 | #9 | 部分 | `ChatPanel` 仍以纯文本时间线为主；工具/Swarm 细节见事件流 |
| 国际化 | #10 | 未落地 | 无 i18n 框架，界面为中文文案 |
| OpenSpec 项目上下文 | #11 | 已落地 | `openspec/config.yaml` 含 `context` 与 `rules` |

定时任务：添加/删除任务后，桌面端在收到 `ScheduleJobAdded` / `ScheduleJobRemoved` 时会自动请求 `ScheduleList` 刷新列表（见 `App.tsx` 内核对逻辑）。