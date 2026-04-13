# z-claw

*中文：[README.zh.md](README.zh.md)*

**z-claw** is a local-first AI agent desktop app: a **Tauri 2** shell (`src-tauri`) hosts a **React** UI (`apps/desktop`) that talks to a **Rust kernel** (`crates/z-claw-kernel`) over a typed command/event protocol. Sessions, tools (including MCP), memory, scheduling, multi-agent workflows, and workspace agent profiles all run in the kernel; the UI sends `UiCommand` and listens for `KernelEvent`.

## Features (high level)

- **Chat & sessions** — Create/rename/delete sessions, load history, stream assistant output and tool traces.
- **Agents** — Workspace-scoped agent folders (`IDENTITY.md` / `MEMORY.md`), list/set active agent, in-app profile load/save, delegate to another profile.
- **Tools & MCP** — MCP tool pool; refresh catalog; tool approval flow when policy requires it.
- **Automation** — Cron-style scheduled jobs (policy-validated) with list/add/remove.
- **Health** — `RunHealthCheck` / CLI `doctor` for config, data dir, providers, MCP.
- **i18n** — UI strings bundled under `src-tauri/resources/locales` and loaded via Tauri (`read_locale_file`); zh/en switch in settings.

## Repository layout

| Path | Role |
| ---- | ---- |
| [`apps/desktop`](apps/desktop) | Vite + React 19 + TypeScript UI. Consumes **`@workspace/ui`**. Dev server default: `http://localhost:1420` (used by Tauri). |
| [`packages/ui`](packages/ui) | Shared UI kit (shadcn-style primitives, Tailwind). Exported as `@workspace/ui`. |
| [`src-tauri`](src-tauri) | Tauri 2 crate **`z-claw`**: windowing, `kernel_send` / `kernel-event` bridge, `read_locale_file`, bundles `apps/desktop/dist`. |
| [`crates/z-claw-kernel`](crates/z-claw-kernel) | Core logic: orchestration, providers, MCP, memory, scheduler, policy, workspace agents, SQLite transcript, protocol types. |
| [`crates/z-claw-cli`](crates/z-claw-cli) | Headless **`z-claw-cli`**: run kernel with events on stderr (CI/scripts); **`z-claw-cli doctor`** for one-shot health checks. |
| [`openspec/`](openspec) | OpenSpec artifacts; project context and AI rules in [`openspec/config.yaml`](openspec/config.yaml). |
| [`.skills/`](.skills) | Authoritative agent skill sources (`openspec-*`, `github-*`, …). Run **`pnpm sync-skills`** to copy into tool-specific `skills/` dirs (mostly gitignored). |

Protocol source of truth: [`crates/z-claw-kernel/src/protocol.rs`](crates/z-claw-kernel/src/protocol.rs) (`UiCommand`, `KernelEvent`). Extend desktop and kernel types together when changing the contract.

## Requirements

- **Node.js** ≥ 20, **pnpm** 9 (`packageManager` in root `package.json`)
- **Rust** stable (2024 edition workspace) for `cargo` / Tauri / CLI

Linux desktop builds need WebKit/GTK dev packages (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml) for the apt list used in CI).

## Quick start

```bash
pnpm install
pnpm tauri dev    # builds desktop + runs Vite + opens the app
```

Root scripts wrap the desktop package:

| Script | Description |
| ------ | ----------- |
| `pnpm dev` | `z-claw-desktop` Vite dev server |
| `pnpm build` | `tsc` + Vite production build (also used as Tauri `beforeBuildCommand`) |
| `pnpm typecheck` / `pnpm test` | All workspaces that define these scripts |
| `pnpm tauri build` | Production desktop bundle (platform installers per Tauri) |
| `pnpm sync-skills` | Sync `.skills/` into local agent tool directories |

Rust (from repo root):

```bash
cargo build -p z-claw-cli
cargo run -p z-claw-cli -- doctor   # health check, no full kernel loop
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

## CI and releases

- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): on `push` to `main` and on PRs — `pnpm install`, `pnpm typecheck`, `pnpm test`, then `cargo clippy` and `cargo test` on Ubuntu with Tauri Linux deps installed.
- **Releases** ([`.github/workflows/release.yml`](.github/workflows/release.yml)): pushing a SemVer tag `v*` builds Tauri artifacts for multiple platforms and publishes GitHub Release assets.

## Contributing

See **[CONTRIBUTING.md](CONTRIBUTING.md)** (merge target: **`main`** on `z-claw/z-claw`). PR bodies should follow [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).

## OpenSpec

When writing proposals or tasks, follow `context` and `rules` in [`openspec/config.yaml`](openspec/config.yaml) and keep them consistent with this README.

## Star History

<a href="https://www.star-history.com/?repos=z-claw%2Fz-claw&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=z-claw/z-claw&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=z-claw/z-claw&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=z-claw/z-claw&type=date&legend=top-left" />
 </picture>
</a>
