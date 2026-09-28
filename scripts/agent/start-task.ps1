<#
.SYNOPSIS
  Start an autonomous task branch from origin/develop (PR-only workflow).
.EXAMPLE
  .\scripts\agent\start-task.ps1 -TaskId "0.1" -Slug "ci-green"
#>
param(
  [Parameter(Mandatory = $true)][string]$TaskId,
  [Parameter(Mandatory = $true)][string]$Slug
)

$ErrorActionPreference = 'Stop'

function Assert-CleanEnough {
  $porcelain = git status --porcelain
  if ($porcelain) {
    Write-Warning "Working tree is not clean. Commit/stash unrelated changes before continuing."
    Write-Host $porcelain
    throw "Refusing to start task on a dirty tree."
  }
}

$repoRoot = git rev-parse --show-toplevel
Set-Location $repoRoot

$branch = "feat/tps-$TaskId-$Slug"
if ($branch -notmatch '^feat/tps-[0-9]+\.[0-9]+-[a-z0-9-]+$') {
  throw "Branch name invalid: $branch (expected feat/tps-<id>-<slug>)"
}

Write-Host "==> Fetching origin..."
git fetch origin

Write-Host "==> Checking out develop..."
git checkout develop
git pull --ff-only origin develop

Assert-CleanEnough

$existing = git branch --list $branch
if ($existing) {
  throw "Branch already exists locally: $branch"
}

Write-Host "==> Creating $branch from develop..."
git checkout -b $branch

$taskFolder = Get-ChildItem -Path (Join-Path $repoRoot '.kiro/specs/team-product-surface/tasks') -Directory -Filter "$TaskId-*" -ErrorAction SilentlyContinue | Select-Object -First 1
$taskHint = if ($taskFolder) { $taskFolder.FullName } else { ".kiro/specs/team-product-surface/tasks/$TaskId-*" }

Write-Host @"

Task branch ready: $branch
Task folder: $taskHint
Read: spec.md, plan.md, task.md
Or run: & '$taskHint\work.ps1' -Action status

Next:
  1. Implement per plan.md
  2. & work.ps1 -Action verify
  3. git add -A; & work.ps1 -Action commit
  4. & work.ps1 -Action finish

Rules:
  - PR base must be develop
  - Do NOT push to develop/main
  - Do NOT merge the PR as the agent (open PR and stop)
"@
