# Contributing

## Branches and pull requests

- Start every change from `develop`.
- Open pull requests into `develop` only.
- Do not push commits directly to `develop` or `main`.
- Agents open the pull request and do not merge it.

## Autonomous tasks

Team Product Surface work is one task folder per pull request. The full workflow (branch names, `work.ps1`, and the stop-before-merge rule) is in [`.kiro/specs/team-product-surface/AUTONOMOUS.md`](.kiro/specs/team-product-surface/AUTONOMOUS.md).

Shared helpers used by each task's `work.ps1`:

| Script | Behavior |
|--------|----------|
| `scripts/agent/start-task.ps1` | Create `feat/tps-<id>-<slug>` from `develop` |
| `scripts/agent/finish-task.ps1` | Push that branch and open a pull request into `develop` (does not merge) |
