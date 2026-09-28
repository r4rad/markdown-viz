# Autonomous development — Team Product Surface

## Rules

1. **Base branch:** `develop` only.
2. **Integration:** PRs into `develop` only. Never push feature commits to `develop` or `main`.
3. **Branch naming:** `feat/tps-<taskId>-<slug>`.
4. **One task folder = one PR**.
5. **Agents open the PR and stop** — do not merge, do not `--force`.

## Per-task folders

```text
.kiro/specs/team-product-surface/tasks/<id>-<slug>/
  spec.md   plan.md   task.md   task.json   work.ps1
```

Index: [tasks/README.md](./tasks/README.md)

## Quick start

```powershell
cd markdown-viz
cd .kiro/specs/team-product-surface/tasks/0.1-ci-green

.\work.ps1 -Action all        # checkout develop, create branch
# ... implement per plan.md ...
.\work.ps1 -Action verify
.\work.ps1 -Action commit
.\work.ps1 -Action finish     # push + gh pr create --base develop
# STOP
```

Shared helpers (used by `work.ps1`):

- `scripts/agent/start-task.ps1`
- `scripts/agent/finish-task.ps1`

## After human merges

```powershell
git checkout develop
git pull --ff-only origin develop
```
