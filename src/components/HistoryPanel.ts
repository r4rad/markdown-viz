import { getActiveTab, getState, updateTabContent, canEditActiveWorkspace } from '../lib/state';
import { getCurrentUser } from '../lib/auth';
import { listVersions, recordVersion } from '../lib/version-store';
import { unifiedDiff } from '../lib/unified-diff';
import { restoreApplies } from '../lib/versions';
import { recordActivity } from '../lib/activity-store';
import { on } from '../lib/events';
import {
  formatHistoryTime,
  gitCommitUrl,
  resolveRepoLink,
  shortAuthor,
  shortSha,
  sortHistoryNewestFirst,
  versionGitSha,
} from '../lib/history-ui';
import type { DocVersion } from '../types';

let panelEl: HTMLElement | null = null;
let cachedVersions: DocVersion[] = [];
let selectedVersionId: string | null = null;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function canRestore(): boolean {
  const wsId = getState().activeWorkspaceId;
  if (wsId === 'personal') return true;
  return restoreApplies(getState().currentRole);
}

export function createHistoryPanel(): HTMLElement {
  panelEl = document.createElement('aside');
  panelEl.id = 'history-panel';
  panelEl.className = 'history-panel history-panel-collapsed';
  panelEl.setAttribute('aria-label', 'Version history');
  panelEl.innerHTML = `
    <div class="history-panel-header">
      <h3>History</h3>
      <button type="button" id="history-close" aria-label="Close history">×</button>
    </div>
    <div class="history-panel-toolbar">
      <button type="button" id="history-checkpoint">Save checkpoint</button>
      <button type="button" id="history-restore" disabled>Restore</button>
    </div>
    <div class="history-panel-list" id="history-list"></div>
    <div class="history-panel-diff">
      <pre id="history-diff" class="history-diff-pre" aria-label="Unified diff"></pre>
    </div>
  `;

  panelEl.querySelector('#history-close')!.addEventListener('click', () => {
    setHistoryPanelOpen(false);
  });
  panelEl.querySelector('#history-checkpoint')!.addEventListener('click', () => {
    void saveCheckpoint();
  });
  panelEl.querySelector('#history-restore')!.addEventListener('click', () => {
    void restoreSelected();
  });

  on('active-tab-changed', () => {
    if (panelEl && !panelEl.classList.contains('history-panel-collapsed')) {
      void refreshHistory();
    }
  });
  on('state-changed', () => {
    updateToolbarAcl();
  });

  return panelEl;
}

export function setHistoryPanelOpen(open: boolean): void {
  if (!panelEl) return;
  panelEl.classList.toggle('history-panel-collapsed', !open);
  if (open) void refreshHistory();
}

export function toggleHistoryPanel(): void {
  if (!panelEl) return;
  setHistoryPanelOpen(panelEl.classList.contains('history-panel-collapsed'));
}

export async function openHistoryPanel(): Promise<void> {
  setHistoryPanelOpen(true);
}

function updateToolbarAcl(): void {
  if (!panelEl) return;
  const checkpoint = panelEl.querySelector('#history-checkpoint') as HTMLButtonElement | null;
  const restore = panelEl.querySelector('#history-restore') as HTMLButtonElement | null;
  if (checkpoint) checkpoint.disabled = !canEditActiveWorkspace();
  if (restore) {
    restore.disabled = !selectedVersionId || !canRestore();
    restore.title = canRestore() ? 'Restore selected version' : 'Viewers cannot restore';
  }
}

export async function refreshHistory(): Promise<void> {
  const tab = getActiveTab();
  const wsId = getState().activeWorkspaceId;
  selectedVersionId = null;
  if (!tab || wsId === 'personal') {
    cachedVersions = [];
    renderList();
    renderDiff(null);
    updateToolbarAcl();
    return;
  }
  cachedVersions = sortHistoryNewestFirst(await listVersions(wsId, tab.id));
  renderList();
  renderDiff(null);
  updateToolbarAcl();
}

function renderList(): void {
  const list = panelEl?.querySelector('#history-list');
  if (!list || !panelEl) return;
  list.replaceChildren();

  const tab = getActiveTab();
  const wsId = getState().activeWorkspaceId;
  if (!tab) {
    list.textContent = 'Open a document to see history.';
    return;
  }
  if (wsId === 'personal') {
    list.textContent = 'Switch to a shared workspace to browse version history.';
    return;
  }
  if (!cachedVersions.length) {
    list.textContent = 'No versions yet. Save a checkpoint to start history.';
    return;
  }

  const repo = resolveRepoLink(tab, getState().folders);

  for (const version of cachedVersions) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'history-version-row' + (version.id === selectedVersionId ? ' is-selected' : '');
    row.dataset.versionId = version.id;

    const sha = versionGitSha(version);
    const commitHref = gitCommitUrl(sha, repo);
    const shaHtml = sha
      ? (commitHref
        ? `<a class="history-git-sha" href="${escapeHtml(commitHref)}" target="_blank" rel="noopener noreferrer" data-sha-link="1">${escapeHtml(shortSha(sha))}</a>`
        : `<span class="history-git-sha" title="${escapeHtml(sha)}">${escapeHtml(shortSha(sha))}</span>`)
      : '';

    row.innerHTML = `
      <span class="history-version-meta">
        <span class="history-version-source">${escapeHtml(version.source)}</span>
        <span class="history-version-time">${escapeHtml(formatHistoryTime(version.createdAt))}</span>
      </span>
      <span class="history-version-author">${escapeHtml(shortAuthor(version.authorId))}</span>
      ${shaHtml ? `<span class="history-version-sha">${shaHtml}</span>` : ''}
    `;

    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-sha-link]')) return;
      selectedVersionId = version.id;
      renderList();
      renderDiff(version);
      updateToolbarAcl();
    });
    list.appendChild(row);
  }
}

function renderDiff(version: DocVersion | null): void {
  const pre = panelEl?.querySelector('#history-diff') as HTMLElement | null;
  if (!pre) return;
  const tab = getActiveTab();
  if (!version || !tab) {
    pre.textContent = 'Select a version to preview the diff against the current document.';
    return;
  }
  const prior = version.content ?? '';
  pre.textContent = unifiedDiff(tab.content, prior, 'current', `version-${version.id.slice(0, 8)}`);
}

async function saveCheckpoint(): Promise<void> {
  if (!canEditActiveWorkspace()) {
    window.alert('Only editors and owners can save checkpoints.');
    return;
  }
  const tab = getActiveTab();
  const wsId = getState().activeWorkspaceId;
  if (!tab || wsId === 'personal') {
    window.alert('Open a file in a shared workspace to save history.');
    return;
  }
  const user = getCurrentUser();
  const result = await recordVersion({
    workspaceId: wsId,
    fileId: tab.id,
    authorId: user?.uid || 'unknown',
    source: 'save',
    content: tab.content,
  });
  if (!result.skipped) {
    await recordActivity({
      workspaceId: wsId,
      action: 'edit',
      fileId: tab.id,
      checksum: result.version?.checksum,
    });
  }
  await refreshHistory();
}

async function restoreSelected(): Promise<void> {
  if (!canRestore()) {
    window.alert('Viewers cannot restore.');
    return;
  }
  const tab = getActiveTab();
  const wsId = getState().activeWorkspaceId;
  if (!tab || !selectedVersionId || wsId === 'personal') return;

  const chosen = cachedVersions.find(v => v.id === selectedVersionId);
  if (!chosen) return;

  const content = chosen.content;
  if (content == null) {
    window.alert('This version’s content is not available in the browser (large snapshot). Restore from Storage is not wired yet.');
    return;
  }

  if (!window.confirm('Restore this version into the editor? A new history event will be recorded.')) {
    return;
  }

  updateTabContent(tab.id, content);
  await recordVersion({
    workspaceId: wsId,
    fileId: tab.id,
    authorId: getCurrentUser()?.uid || 'unknown',
    source: 'restore',
    content,
  });
  await recordActivity({ workspaceId: wsId, action: 'restore', fileId: tab.id });
  await refreshHistory();
}
