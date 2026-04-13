# 参与贡献

本文说明如何向 **本仓库**（`z-claw/z-claw`）提交改动。合并目标、CI、Issue 与 Roadmap 均以 **`main` 分支** 为准。

## Pull Request

- 请向 **`main`** 打开 Pull Request（本仓库为默认 base）。
- PR 正文请遵循 [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md)。

## 本地开发与检查

提交前建议在本地运行与 CI 一致的检查（详见模板中的命令列表），例如 `pnpm typecheck`、`pnpm test`、`cargo clippy`、`cargo test` 等。

## 通过 fork 参与时

若你**没有**本仓库的直接写权限，需先 fork，在 fork 上开发后再向 **本仓库的 `main`** 发起 PR：

1. 将功能分支推送到 **你的 fork**。
2. 在 GitHub 上打开 **本仓库** → Pull requests → New pull request → **Compare across forks**：**base** 选 `z-claw/z-claw` 的 `main`，**compare** 选你 fork 上的分支。

使用 GitHub CLI 时，将默认仓库设为本仓库，并显式指定 head 为你的 fork 分支（`你的用户名:分支名`），例如：

```bash
gh repo set-default z-claw/z-claw
gh pr create --repo z-claw/z-claw --base main --head "$(gh api user --jq .login):<分支名>"
```

已 `gh repo set-default z-claw/z-claw` 时，可省略 `--repo z-claw/z-claw`，但仍需提供 `--head <fork 拥有者>:<分支名>`，否则 CLI 会误认为分支在本仓库内。
