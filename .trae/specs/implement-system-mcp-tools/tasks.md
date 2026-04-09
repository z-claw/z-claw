# Tasks
- [x] Task 1: 在 `mcp_pool.rs` 中定义系统操作的内置工具
  - [x] SubTask 1.1: 补充 `execute_command` 工具定义，参数包括 `command` 和 `cwd`（工作目录）。
  - [x] SubTask 1.2: 补充 `read_file` 工具定义，参数为 `path`。
  - [x] SubTask 1.3: 补充 `write_file` 工具定义，参数为 `path` 和 `content`。
  - [x] SubTask 1.4: 补充 `list_directory` 工具定义，参数为 `path`。

- [x] Task 2: 在 `turn.rs` 的 `execute_tool` 函数中实现对应的内置工具执行逻辑
  - [x] SubTask 2.1: 实现 `execute_command` 的逻辑，支持通过 `tokio::process::Command` 在 Windows 下运行（例如使用 `cmd.exe /c` 或 `powershell -c`），并捕获标准输出和错误输出。
  - [x] SubTask 2.2: 实现 `read_file`，通过 `tokio::fs::read_to_string` 读取内容，处理不存在或权限错误。
  - [x] SubTask 2.3: 实现 `write_file`，通过 `tokio::fs::write` 覆盖写入内容，必要时创建父目录。
  - [x] SubTask 2.4: 实现 `list_directory`，返回指定路径下的文件列表，包括文件名、类型（文件/文件夹）等信息。

# Task Dependencies
- [Task 2] depends on [Task 1]
