# Contributing

*中文：[CONTRIBUTING.zh.md](CONTRIBUTING.zh.md)*

This document describes how to contribute to **this repository** (`z-claw/z-claw`). Integration branch, CI, issues, and the roadmap all use **`main`** as the source of truth.

## Pull requests

- Open pull requests against **`main`** (default base for this repo).
- Use [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) for the PR body.

## Local development and checks

Before submitting, run the same checks as CI where practical (see the template for the command list), e.g. `pnpm typecheck`, `pnpm test`, `cargo clippy`, `cargo test`.

## Contributing via a fork

If you **do not** have push access here, fork the repo, work on a branch in your fork, then open a PR **into this repo’s `main`**:

1. Push your feature branch to **your fork**.
2. On GitHub: open **this repository** → Pull requests → New pull request → **Compare across forks**: set **base** to `z-claw/z-claw` `main` and **compare** to your fork’s branch.

With GitHub CLI, point the default repo here and pass **head** as your fork branch (`owner:branch`), for example:

```bash
gh repo set-default z-claw/z-claw
gh pr create --repo z-claw/z-claw --base main --head "$(gh api user --jq .login):<branch>"
```

If you already ran `gh repo set-default z-claw/z-claw`, you may omit `--repo z-claw/z-claw`, but you still need `--head <fork-owner>:<branch>` so the CLI does not assume the branch exists on this repo.
