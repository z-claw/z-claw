# z-claw

*English: [README.md](README.md)*

**z-claw** 是一款本地优先的 AI Agent 桌面应用：**Tauri 2** 壳（`src-tauri`）承载 **React** 前端（`apps/desktop`），通过类型化的命令/事件协议与 **Rust 内核**（`crates/z-claw-kernel`）通信。会话、工具（含 MCP）、记忆、定时任务、多智能体协作与工作区智能体档案均由内核处理；前端发送 `UiCommand` 并订阅 `KernelEvent`。

## 功能概览

- **对话与会话** — 创建/重命名/删除会话、加载历史、展示助手输出与工具轨迹。
- **智能体** — 工作区目录下的智能体文件夹（`IDENTITY.md` / `MEMORY.md`）、列表与激活、应用内加载/保存档案、委托给其他档案。
- **工具与 MCP** — MCP 连接池、刷新工具目录、策略要求时的工具审批。
- **自动化** — 经策略校验的类 Cron 定时任务，支持列表/新增/删除。
- **健康检查** — `RunHealthCheck` 与 CLI `doctor`（配置、数据目录、Provider、MCP）。
- **国际化** — 文案打包在 `src-tauri/resources/locales`，经 Tauri `read_locale_file` 加载；设置中可切换中/英。

## 仓库结构


| 路径                                             | 说明                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `[apps/desktop](apps/desktop)`                 | Vite + React 19 + TypeScript，依赖 `**@workspace/ui*`*。开发服务器默认 `http://localhost:1420`（供 Tauri 使用）。        |
| `[packages/ui](packages/ui)`                   | 共享 UI（shadcn 风格、Tailwind），包名 `@workspace/ui`。                                                           |
| `[src-tauri](src-tauri)`                       | Tauri 2 crate `**z-claw**`：窗口、`kernel_send` / `kernel-event`、`read_locale_file`，打包 `apps/desktop/dist`。 |
| `[crates/z-claw-kernel](crates/z-claw-kernel)` | 核心：编排、Provider、MCP、记忆、调度、策略、工作区智能体、SQLite 会话记录、协议类型。                                                    |
| `[crates/z-claw-cli](crates/z-claw-cli)`       | 无头 `**z-claw-cli**`：内核事件输出到 stderr（CI/脚本）；`**z-claw-cli doctor**` 一次性健康检查。                              |
| `[openspec/](openspec)`                        | OpenSpec 产物；项目上下文与 AI 规则见 `[openspec/config.yaml](openspec/config.yaml)`。                               |
| `[.skills/](.skills)`                          | Agent Skill 源文件；修改后执行 `**pnpm sync-skills**` 同步到各工具链 `skills/`（多为 gitignore）。                           |


协议以 `[crates/z-claw-kernel/src/protocol.rs](crates/z-claw-kernel/src/protocol.rs)` 为准；变更时请同时协调前端与内核类型。

## 环境要求

- **Node.js** ≥ 20、**pnpm** 9（见根目录 `package.json` 的 `packageManager`）
- **Rust** stable（工作区为 2024 edition），用于 `cargo` / Tauri / CLI

Linux 桌面构建需 WebKit/GTK 等开发包（CI 中 apt 列表见 `[.github/workflows/ci.yml](.github/workflows/ci.yml)`）。

## 快速开始

```bash
pnpm install
pnpm tauri dev    # 构建桌面前端并拉起 Vite + 打开应用
```

根目录脚本多为对 desktop 包的封装：


| 脚本                             | 说明                                               |
| ------------------------------ | ------------------------------------------------ |
| `pnpm dev`                     | `z-claw-desktop` 的 Vite 开发服务                     |
| `pnpm build`                   | `tsc` + Vite 生产构建（亦为 Tauri `beforeBuildCommand`） |
| `pnpm typecheck` / `pnpm test` | 各 workspace 中声明了对应脚本则执行                          |
| `pnpm tauri build`             | 桌面端正式打包（按平台生成安装包）                                |
| `pnpm sync-skills`             | 将 `.skills/` 同步到本地各 Agent 工具目录                   |


Rust（在仓库根目录）：

```bash
cargo build -p z-claw-cli
cargo run -p z-claw-cli -- doctor
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

## CI 与发布

- **CI**（`[.github/workflows/ci.yml](.github/workflows/ci.yml)`）：对 `main` 的 `push` 与 PR — `pnpm install`、`pnpm typecheck`、`pnpm test`，再在 Ubuntu 上安装 Tauri Linux 依赖后执行 `cargo clippy` 与 `cargo test`。
- **发布**（`[.github/workflows/release.yml](.github/workflows/release.yml)`）：推送符合 SemVer 的 `v*` 标签，多平台构建 Tauri 产物并上传 GitHub Release。

## 协作

见 **[CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)**（合并目标为 `z-claw/z-claw` 的 `**main`**）。PR 正文遵循 `[.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md)`。

## OpenSpec

撰写提案与任务时，遵守 `[openspec/config.yaml](openspec/config.yaml)` 中的 `context` 与 `rules`，并与本 README 保持一致。

## Star History

<a href="https://www.star-history.com/?repos=z-claw%2Fz-claw&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=z-claw/z-claw&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=z-claw/z-claw&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=z-claw/z-claw&type=date&legend=top-left" />
 </picture>
</a>
