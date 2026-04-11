## Summary

Describe this PR in a few bullets:

- Base branch: **`main`**
- Problem:
- Why it matters:
- What changed:
- What did **not** change (scope boundary):

## Scope (optional)

If your fork uses GitHub labels, add them; otherwise tick areas touched:

- [ ] `desktop` (`apps/desktop`)
- [ ] `bridge` (`src-tauri`)
- [ ] `kernel` (`crates/z-claw-kernel`)
- [ ] `ui` (`packages/ui`)
- [ ] `cli` (`crates/z-claw-cli`)
- [ ] `openspec` (`openspec/`)
- [ ] `ci` / tooling (`.github`, scripts)

## Change metadata

- Change type (`bug|feature|refactor|docs|security|chore`):
- Primary area (`desktop|bridge|kernel|ui|cli|openspec|ci|multi`):

## Conventions

- Follow the root **README.md** and **`openspec/config.yaml`** (project context and OpenSpec rules).

## Linked issues

- Closes #
- Related #
- Depends on # (if stacked)

## Validation evidence (required)

Commands aligned with [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

```bash
pnpm typecheck
pnpm test
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

**Recommended locally (not required by current CI):**

```bash
cargo fmt --all -- --check
pnpm lint
```

- Evidence provided (logs, test output, screenshot — redact secrets):
- If any command was skipped, explain why:

## Security impact (required)

- New permissions/capabilities? (`Yes`/`No`)
- New external network calls? (`Yes`/`No`)
- Secrets/tokens handling changed? (`Yes`/`No`)
- File system access scope changed? (`Yes`/`No`)
- If any `Yes`, describe risk and mitigation:

## Privacy and data hygiene (required)

- Data-hygiene status (`pass` / `needs-follow-up`):
- Redaction notes for logs or screenshots:

## User-visible strings / i18n

- UI or user-facing text changed? (`Yes`/`No`)
- If `Yes`, updated **`src-tauri/resources/locales/en.json`** and **`zh.json`**? (`Yes`/`No` / N.A.)

## Compatibility / migration

- Backward compatible? (`Yes`/`No`)
- Config/env changes? (`Yes`/`No`)
- Migration notes (if any):

## Human verification (recommended)

- Scenarios checked manually:
- Edge cases:
- Not verified (and why):

## Side effects / blast radius

- Affected workflows or subsystems:
- Unintended effects to watch for:

## Agent collaboration notes (optional)

- Tools or workflows used (if any):
- Focus of verification:

## Rollback

- How to revert (revert commit / config toggle / feature path):
- What failure would look like:

## Risks and mitigations

List real risks in this PR, or write `None`.

- Risk:
  - Mitigation:

## Co-authorship (optional)

- `Co-authored-by:` trailers for substantive contributions from others (`Yes`/`No` / N.A.)
