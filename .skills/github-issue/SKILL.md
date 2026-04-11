---
name: github-issue
description: >-
  Draft and triage GitHub issues for the z-claw repo (Tauri desktop + Rust kernel).
  Use when creating bug reports, feature requests, or summarizing issues for maintainers.
---

# GitHub issues (z-claw)

## When to use

- Writing or expanding Bug / Feature issue text, reproduction details, or component triage.

## Repository map (pick the right component)

| Area | Path | Notes |
|------|------|--------|
| Desktop UI | `apps/desktop` | Tauri 2 + Vite + React; do not rely on browser-only `pnpm dev` for the full shell (see root README). |
| Tauri bridge | `src-tauri` | `kernel_send` / `KernelEvent`, talks to the kernel. |
| Kernel | `crates/z-claw-kernel` | Sessions, tools, agent profiles, orchestration. |
| Shared UI | `packages/ui` | `@workspace/ui`. |
| Headless CLI | `crates/z-claw-cli` | Kernel-only run + events; `z-claw-cli doctor` health check. |
| OpenSpec | `openspec/` | Specs and `openspec/config.yaml` project context. |
| CI / tooling | `.github/workflows`, root `package.json` scripts | |

Match the issue template “Affected component” to this table; if unsure, choose `unknown` and describe symptoms.

## Bug reports

1. **Reproduction**: Prefer steps under the full Tauri app (`pnpm tauri dev` from repo root) or a released build. For kernel/CLI-only issues, include `z-claw-cli` / `cargo run -p z-claw-cli` where relevant.
2. **Current vs expected**: State both clearly.
3. **Versions**: App version from root / `src-tauri` / `apps/desktop` `package.json`, or `git rev-parse HEAD`. For Rust build/kernel issues, add `rustc --version`.
4. **Logs**: Redact tokens, paths, and PII; note the OS.
5. **Roadmap cross-check**: Root README has a Roadmap ↔ issue table; **source of truth is the codebase** if titles diverge.

## Feature requests

- User value, constraints, and non-goals (use a Non-goals section when scope could be misread).
- If UI talks to the kernel, call out whether `UiCommand` / `KernelEvent` must change (see `crates/z-claw-kernel/src/protocol.rs`).
- Architecture impact: name affected areas among `apps/desktop`, `src-tauri`, `z-claw-kernel`, `packages/ui`, `openspec/`, etc.

## Output conventions

- Title prefixes match repo templates: `[Bug]:` / `[Feature]:`.
- Language: English or Chinese is fine—match the discussion; never paste live secrets or unredacted private data.

## Source of truth and sync

- Edit this skill only under **`.skills/github-issue/`** in the repository.
- After changes, run **`pnpm sync-skills`** (or `node scripts/sync_skills.mjs`) to copy into each agent `skills/` folder. Those copies are git-ignored; **`.skills/`** is what you commit.
