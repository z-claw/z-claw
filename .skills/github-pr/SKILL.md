---
name: github-pr
description: >-
  Prepare pull requests for z-claw (pnpm monorepo + Rust workspace): scope, validation
  commands matching CI, protocol/OpenSpec notes. Use when opening a PR or writing the description.
---

# GitHub pull requests (z-claw)

## When to use

- Opening a PR, writing the description, or summarizing what changed and how it was verified.

## Branching and scope

- Target branch: **`main`**.
- If you change **UI–kernel messaging**, update together:
  - Protocol in `crates/z-claw-kernel` (e.g. `protocol.rs`)
  - Desktop types and call sites for `KernelEvent` / `UiCommand`
- Avoid unrelated refactors; state explicit out-of-scope items in the PR body.

## Validation (must match CI)

Local or CI-equivalent commands (see `.github/workflows/ci.yml`):

```bash
pnpm typecheck
pnpm test
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

**Recommended locally (not enforced by CI today):**

```bash
cargo fmt --all -- --check
pnpm lint
```

If anything is skipped, explain why in the PR.

## OpenSpec

- If you change specs under `openspec/` or `context` / `rules` in `openspec/config.yaml`, keep implementation and docs consistent. Proposal-style work follows the repo OpenSpec workflow (see `openspec-*` under **`.skills/`**, synced into each agent `skills/` directory).

## User-visible copy and i18n

- When changing UI strings, update **`src-tauri/resources/locales`** **`en.json`** and **`zh.json`** (run `pnpm locales` or other locale scripts under `apps/desktop` when the repo expects regenerated JSON).

## What the PR body should include

- **Summary**: problem, what changed, what you deliberately did not change.
- **Links**: `Closes #` / `Related #` when applicable.
- **Verification**: commands run and outcome; screenshots for UI (redact secrets).
- **Risk**: permissions, network, filesystem, config surface (if any).

## Relation to templates

- Follow `.github/pull_request_template.md`; this skill stresses alignment with **real CI**, **protocol changes**, and **i18n**.

## Source of truth and sync

- Edit this skill only under **`.skills/github-pr/`** in the repository.
- After changes, run **`pnpm sync-skills`** (or `node scripts/sync_skills.mjs`) to copy into each agent `skills/` folder. Those copies are git-ignored; **`.skills/`** is what you commit.
