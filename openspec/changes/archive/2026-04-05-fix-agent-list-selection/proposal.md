## Why

侧边栏智能体下拉为受控组件：当内核中的 `active_agent_id` 与磁盘 `workspace` 目录名在字面上不一致时（在 Windows 上较常见），选项列表里没有与当前 `value` 匹配的 `<option>`，导致无法可靠切换已有智能体。此外，`SetActiveAgent` 在加载档案失败时不向 UI 发送任何事件，用户会感觉点击无效。

## What Changes

- 前端：合并 `agentsList` 与当前 `activeAgent` 生成下拉选项（去重、排序），保证受控 `select` 的 `value` 始终对应某个选项。
- 内核：`SetActiveAgent` 在 `load_agent_profile` 失败时发送 `KernelEvent::Error`，携带可读说明。
- 前端：监听 `Error` 事件并以 toast 提示，避免静默失败。

## Capabilities

### New Capabilities

- `agent-selection-ui`: 桌面侧边栏智能体身份下拉的展示与选项完整性（含与内核 `AgentsList` / `active` 的协同）。
- `agent-switch-feedback`: 切换当前智能体（`SetActiveAgent`）时成功与失败的可观测行为（事件与 UI 反馈）。

### Modified Capabilities

<!-- 仓库内尚无 openspec/specs 基线；无既有能力需 delta。-->

## Impact

- `apps/desktop/src/components/layout/Sidebar.tsx`：选项派生逻辑。
- `apps/desktop/src/App.tsx`：`kernel-event` 对 `Error` 的处理。
- `crates/z-claw-kernel/src/orchestrator.rs`：`SetActiveAgent` 错误路径。
