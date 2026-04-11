---
name: github-pr-review
description: >-
  Review z-claw pull requests with a consistent checklist: bridge/kernel boundaries,
  Tauri safety, events, tests, and i18n. Use for human or agent-led code review.
---

# GitHub PR review (z-claw)

## When to use

- Code review, review comments, or summarizing risk and test gaps.

## Review order

See [references/review-protocol.md](references/review-protocol.md) for the full sequence. Summary:

1. **Security and trust boundaries**: new network, file, subprocess, or env access; secrets leaking to logs or the frontend.
2. **Correctness**: logic, error paths, consistency with configuration.
3. **Bridge and kernel**: `src-tauri` ↔ `z-claw-kernel`; `UiCommand` / `KernelEvent` updated on both sides.
4. **Concurrency and events**: channel/async ordering; duplicate, lost, or racy UI updates on `KernelEvent` streams.
5. **Frontend**: React behavior, Vitest coverage; manual verification called out for large UI changes.
6. **Rust**: beyond CI clippy—`unsafe`, locking, resource cleanup.
7. **Docs and i18n**: user-visible strings in `src-tauri/resources/locales` (en/zh); README / OpenSpec updates if needed.

## z-claw–specific hotspots

| Area | Watch for |
|------|-----------|
| `src-tauri` | Command args exposed to the frontend, path joining, least privilege |
| `z-claw-kernel` | Provider/MCP/tools, workspace paths, errors surfaced to the UI |
| `z-claw-cli` | Headless-only behavior vs the desktop shell |
| `apps/desktop` | Kernel event subscriptions, load/save agent profile flows |

## Comment style

- Acknowledge what is solid, then **must-fix** / **should-fix** / **nit**.
- When asking for more proof, point to the same CI commands as in the `github-pr` skill.

## Source of truth and sync

- Edit this skill only under **`.skills/github-pr-review/`** in the repository.
- After changes, run **`pnpm sync-skills`** (or `node scripts/sync_skills.mjs`) to copy into each agent `skills/` folder. Those copies are git-ignored; **`.skills/`** is what you commit.
