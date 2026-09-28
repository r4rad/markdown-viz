<#
.SYNOPSIS
  Push the current feat/tps-* branch and open a PR into develop. Does not merge.
.EXAMPLE
  .\scripts\agent\finish-task.ps1 -TaskId "0.1" -Title "fix: CI green" -Body "Spec task 0.1"
#>
param(
  [Parameter(Mandatory = $true)][string]$TaskId,
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Body
)

$ErrorActionPreference = 'Stop'

$repoRoot = git rev-parse --show-toplevel
Set-Location $repoRoot

$branch = git branch --show-current
if ($branch -notmatch "^feat/tps-$([regex]::Escape($TaskId))-") {
  throw "Current branch '$branch' does not match feat/tps-$TaskId-*. Aborting."
}
if ($branch -eq 'develop' -or $branch -eq 'main') {
  throw "Refusing to finish from protected branch: $branch"
}

# Block direct pushes to protected branches even if upstream mis-set
$protected = @('develop', 'main')
foreach ($p in $protected) {
  if ($branch -eq $p) { throw "Protected branch" }
}

Write-Host "==> Status"
git status -sb

$pending = git status --porcelain
if (-not $pending) {
  Write-Host "No uncommitted changes; will push existing commits and open/refresh PR."
} else {
  throw "Uncommitted changes present. Commit them before finish-task (agent must commit explicitly)."
}

Write-Host "==> Pushing $branch..."
git push -u origin HEAD

$prBody = @"
$Body

---
Autonomous task finish
- Spec folder: `.kiro/specs/team-product-surface/tasks/$TaskId-*`
- Task: `$TaskId`
- Base: `develop` (required)
- Agent must NOT merge this PR
"@

Write-Host "==> Creating PR into develop..."
gh pr create --base develop --head $branch --title $Title --body $prBody

Write-Host @"

Done. Pull request opened against develop.
STOP HERE — do not merge; do not checkout develop and push.
"@
