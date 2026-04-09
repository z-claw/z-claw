## 1. Sidebar agent options

- [x] 1.1 In `apps/desktop/src/components/layout/Sidebar.tsx`, derive `agentSelectOptions` with `useMemo`: union of `agentsList` and `activeAgent` (if non-empty), dedupe, sort with `localeCompare`.
- [x] 1.2 Render `<option>` elements only from `agentSelectOptions`; remove the `agentsList.length > 0` conditional branch.

## 2. Kernel and desktop error feedback

- [x] 2.1 In `crates/z-claw-kernel/src/orchestrator.rs`, handle `SetActiveAgent` with `match` on `load_agent_profile`: on `Err`, send `KernelEvent::Error { message: ... }` without updating `active_agent_id`.
- [x] 2.2 In `apps/desktop/src/App.tsx`, on `kernel-event` payload containing `Error`, show `toast.error` with the message (and sensible fallback if missing).

## 3. Verification

- [x] 3.1 Run `cargo check -p z-claw-kernel` and desktop TypeScript check (`pnpm --filter z-claw-desktop exec tsc --noEmit`).
- [x] 3.2 Manually verify: multiple agents under workspace, switching updates sessions; invalid agent id shows toast after failed switch attempt.
