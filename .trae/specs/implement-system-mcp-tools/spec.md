# Implement System MCP Tools Spec

## Why
目前 z-claw 作为一个本地桌面 Agent，虽然能够连接外部 MCP Server，但在没有配置外部服务器时，模型缺乏直接操作当前系统的基础能力（如执行终端命令、读写文件、查看目录等）。为了让模型能够真正成为一个具备执行力的桌面助手，我们需要在内核中内置一组系统级操作工具，让模型能够通过 MCP 工具调用的方式操作当前系统。

## What Changes
- 在 `z-claw-kernel/src/mcp_pool.rs` 的 `deferred_tool_definitions` 中增加四个内置工具定义：
  - `execute_command`: 执行本地 shell/命令行指令。
  - `read_file`: 读取本地文件内容。
  - `write_file`: 写入内容到本地文件。
  - `list_directory`: 列出指定目录下的文件和文件夹。
- 在 `z-claw-kernel/src/orchestrator/turn.rs` 的 `execute_tool` 函数中，实现这四个工具的具体执行逻辑。
- 确保 `execute_command` 包含 "command" 关键字，从而自动触发已有的 `is_dangerous_tool` 校验逻辑，保证危险操作能够通过 UI 弹窗请求用户审批。

## Impact
- Affected specs: 增强模型对宿主机操作系统的控制能力。
- Affected code: `crates/z-claw-kernel/src/mcp_pool.rs`, `crates/z-claw-kernel/src/orchestrator/turn.rs`.

## ADDED Requirements
### Requirement: 内置系统级 MCP 工具
系统应当提供读写文件、查看目录和执行命令的内置工具，无需用户配置外部 Node.js/Python MCP 服务器即可使用。

#### Scenario: 模型需要读取项目文件并执行编译命令
- **WHEN** 模型决定分析当前目录结构并运行构建命令时。
- **THEN** 模型依次调用 `list_directory`, `read_file`，最后调用 `execute_command`。
- **THEN** 调用 `execute_command` 时，系统自动触发审批流程等待用户同意后才执行。
