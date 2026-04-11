# z-claw PR review protocol (concise)

Walk through in order; you may stop and request changes after any step if you find a blocker.

## 1. Security and data

- New outbound connections, executable invocation, or broad filesystem access.
- Risk of secrets, tokens, or user paths in logs or frontend state.
- New dependencies: maintenance burden and license fit.

## 2. Correctness and edge cases

- Behavior on empty input, bad config, or network failure.
- Consistency with `AppConfig` / on-disk config; sensible defaults.

## 3. Protocol and bridge

- Message types stay in sync between `crates/z-claw-kernel` and `apps/desktop` / `src-tauri`.
- New `KernelEvent` variants or commands are handled or explicitly ignored and documented on the other side.

## 4. Concurrency and event ordering

- Whether `KernelEvent` ordering is assumed; UI updates that could race or apply after unmount.

## 5. Tests and verification

- Unit tests updated or added (Vitest / `cargo test`).
- PR verification commands match `.github/workflows/ci.yml`.

## 6. Documentation and i18n

- User-visible strings: `src-tauri/resources/locales/en.json` and `zh.json`.
- Whether `openspec/` or root README needs an update.

## 7. Wrap-up

- Scope creep; whether a follow-up PR would be safer.
- Rollback path: config toggle vs revert commit.
