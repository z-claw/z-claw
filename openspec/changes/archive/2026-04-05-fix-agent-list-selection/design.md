## Context

z-claw 桌面应用通过 Tauri 将 `UiCommand` / `KernelEvent` 在 React 前端与 Rust 内核之间传递。智能体档案对应 `workspace` 下的子目录名；`list_agents()` 返回 `read_dir` 的真实名称，而 `active_agent_id` 可能来自默认值或历史状态，在 Windows 等大小写不敏感文件系统上二者可能**字面上不一致**。侧边栏使用受控 `<select value={activeAgent}>`，若选项仅来自 `agents` 数组且不含当前 `active` 字符串，则违反受控组件约束，导致切换异常。`SetActiveAgent` 原仅在成功时推送更新，失败路径无事件。

## Goals / Non-Goals

**Goals:**

- 保证下拉选项集合始终包含当前 `activeAgent` 字符串（与 `agentsList` 合并去重并排序）。
- 切换失败时通过 `KernelEvent::Error` 与前端 toast 提供可观测反馈。
- 保持成功路径行为不变（仍推送 `AgentsList` 与 `SessionsList`）。

**Non-Goals:**

- 不在此变更中实现 workspace 层 agent id 规范化（例如统一写回磁盘真实目录名）；可作为后续改进。
- 不改变 `UiCommand` / `KernelEvent` 的序列化形状（除沿用已有 `Error` 变体）。

## Decisions

1. **选项合并放在 Sidebar（或单一前端派生层）**  
   - **理由**：与渲染绑定，避免 `agents` 与 `active` 不一致的受控问题；不必重复改 `App` 状态与 Sidebar 两处。  
   - **备选**：仅在 `App` 收到 `AgentsList` 时合并——可行但与展示组件解耦较弱，本方案选 Sidebar `useMemo`。

2. **失败反馈使用已有 `KernelEvent::Error`**  
   - **理由**：协议已存在，前端统一监听即可；无需新增事件类型。  
   - **备选**：专用 `SetActiveAgentFailed`——更精确但增加协议面，本次不采用。

3. **全局 toast 处理所有 `Error` 事件**  
   - **理由**：实现简单，与其它内核错误展示一致。  
   - **权衡**：非切换类错误也会弹 toast；若噪音大可后续按 `message` 前缀过滤。

## Risks / Trade-offs

- **[Risk] `Error` toast 过多** → 后续可按场景节流或分类。  
- **[Risk] 合并选项仍显示两个「逻辑相同」条目** → 仅当 `active` 与列表中某项大小写不同时，用户可能看到两条；根治需 workspace 规范化，已列为 Non-Goals。

## Migration Plan

- 纯客户端与内核行为增强，无数据迁移。  
- 回滚：还原 Sidebar、`orchestrator` 中对应分支及 `App` 的 `Error` toast。

## Open Questions

- 是否在后续变更中为 agent id 引入规范形式（canonical casing）并持久化，以消除下拉重复项的可能。
