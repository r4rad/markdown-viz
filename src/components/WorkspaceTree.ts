import {
  addFolder,
  addTab,
  canEditActiveWorkspace,
  deleteFolder,
  getState,
  moveFolder,
  renameFolder,
  setFolderRepoLink,
  setTabDirty,
  setTabFolder,
  switchTab,
  updateTabOrigin,
} from '../lib/state';
import { on, emit } from '../lib/events';
import { getGithubToken } from '../lib/github-token';
import { getFileContent, listMarkdownFiles } from '../lib/github-api';
import { loadRepoIndex, repoIndexKey, saveRepoIndex, type RepoIndexEntry } from '../lib/storage';
import { findTabByGithubPath, normalizePathPrefix } from '../lib/workspace';
import { driveConnector, githubConnector } from '../lib/connectors';
import { isDriveConnectorEnabled } from '../lib/feature-flags';
import type { FolderId, GitHubRepoLink, WorkspaceFolder } from '../types';
import { mountWorkspaceSwitcher, workspaceActions } from './CollabUI';

const linkedCache = new Map<string, RepoIndexEntry[]>();

export function createWorkspaceTree(): HTMLElement {
  const el = document.createElement('aside');
  el.className = 'workspace-tree';
  el.setAttribute('aria-label', 'Workspace');

  const header = document.createElement('div');
  header.className = 'workspace-tree-header';
  header.innerHTML = `<span>Workspace</span><button class="workspace-icon-btn" data-act="new-root" title="New folder">+</button><button class="workspace-icon-btn" data-act="import-folder" title="Import folder">📁</button><button class="workspace-icon-btn" data-act="collab" title="Sharing">⋯</button>`;
  el.appendChild(header);
  mountWorkspaceSwitcher(header);

  const status = document.createElement('div');
  status.className = 'workspace-status';
  el.appendChild(status);

  const list = document.createElement('div');
  list.className = 'workspace-tree-list';
  el.appendChild(list);

  const render = () => {
    const state = getState();
    el.classList.toggle('workspace-tree-collapsed', !state.sidebarOpen);
    list.innerHTML = '';
    const roots = state.folders.filter(f => !f.parentId);
    for (const folder of roots) renderFolder(list, folder, 0);
    renderUnfiled(list);
  };

  header.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-act="new-root"]');
    if (btn) {
      if (!canEditActiveWorkspace()) return;
      const name = window.prompt('Folder name');
      if (name?.trim()) addFolder(name.trim(), null);
    }
    if ((e.target as HTMLElement).closest('[data-act="import-folder"]')) {
      if (!canEditActiveWorkspace()) return;
      emit('import-directory');
    }
    if ((e.target as HTMLElement).closest('[data-act="collab"]')) {
      const acts = workspaceActions();
      const pick = window.prompt(acts.map((a, i) => `${i + 1}. ${a[0]}`).join('\n'));
      const n = Number(pick) - 1;
      if (acts[n]) acts[n][1]();
    }
  });

  on('state-changed', render);
  on('state-restored', render);
  on('layout-changed', render);
  on('auth-changed', render);

  render();
  return el;

  function renderFolder(parent: HTMLElement, folder: WorkspaceFolder, depth: number): void {
    const row = document.createElement('div');
    row.className = 'workspace-row workspace-folder';
    row.style.paddingLeft = `${8 + depth * 14}px`;
    row.innerHTML = `<span class="workspace-label">📁 ${escapeHtml(folder.name)}</span>`;
    row.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      showFolderMenu(folder, ev.clientX, ev.clientY);
    });
    row.addEventListener('dblclick', () => {
      const name = window.prompt('Rename folder', folder.name);
      if (name?.trim()) renameFolder(folder.id, name.trim());
    });
    parent.appendChild(row);

    if (folder.repoLink) {
      const meta = document.createElement('div');
      meta.className = 'workspace-repo-meta';
      meta.style.paddingLeft = `${22 + depth * 14}px`;
      const link = folder.repoLink;
      meta.textContent = `🔗 ${link.owner}/${link.repo}${link.pathPrefix ? ':' + link.pathPrefix : ''}`;
      if (!getGithubToken()) {
        meta.title = 'Authenticate with GitHub to refresh and open linked files.';
        meta.appendChild(document.createTextNode(' — sign in to GitHub'));
      }
      parent.appendChild(meta);

      const cached = linkedCache.get(folder.id) ?? [];
      for (const file of cached) {
        const fileRow = document.createElement('div');
        fileRow.className = 'workspace-row workspace-linked';
        fileRow.style.paddingLeft = `${22 + depth * 14}px`;
        fileRow.textContent = `📄 ${file.path}`;
        fileRow.addEventListener('click', () => openLinkedFile(folder, file).catch(err => setStatus(err.message)));
        parent.appendChild(fileRow);
      }
    }

    const locals = getState().tabs.filter(t => t.folderId === folder.id && t.origin.kind === 'local');
    for (const tab of locals) {
      parent.appendChild(fileRowEl(tab.id, tab.name, depth + 1));
    }

    for (const child of getState().folders.filter(f => f.parentId === folder.id)) {
      renderFolder(parent, child, depth + 1);
    }
  }

  function renderUnfiled(parent: HTMLElement): void {
    const row = document.createElement('div');
    row.className = 'workspace-row workspace-unfiled';
    row.textContent = '📂 Unfiled';
    parent.appendChild(row);
    const tabs = getState().tabs.filter(t => t.folderId == null && t.origin.kind !== 'github');
    for (const tab of tabs) parent.appendChild(fileRowEl(tab.id, tab.name, 1));
    const githubOpen = getState().tabs.filter(t => t.origin.kind === 'github' && t.folderId == null);
    for (const tab of githubOpen) {
      const elRow = fileRowEl(tab.id, tab.name, 1);
      elRow.classList.add('workspace-linked');
      parent.appendChild(elRow);
    }
  }

  function fileRowEl(id: string, name: string, depth: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'workspace-row workspace-file';
    row.style.paddingLeft = `${8 + depth * 14}px`;
    const tab = getState().tabs.find(t => t.id === id);
    const sync = tab?.syncStatus ?? 'InSync';
    const badge =
      sync === 'InSync'
        ? ''
        : `<span class="sync-status-badge sync-status-${sync.toLowerCase()}" title="GitHub sync: ${sync}">${sync}</span>`;
    row.innerHTML = `<span class="workspace-file-name">${escapeHtml(name)}</span>${badge}`;
    if (getState().activeTabId === id) row.classList.add('active');
    if (sync === 'Conflict') row.classList.add('workspace-file-conflict');
    row.addEventListener('click', () => {
      switchTab(id);
      if (sync === 'Conflict' && tab?.openConflictId) {
        void import('./ConflictModal').then(({ openConflictModal }) => {
          openConflictModal({
            id: tab.openConflictId!,
            documentId: id,
            workspaceId: getState().activeWorkspaceId,
            localContent: tab.content,
            remoteContent: tab.content,
            baseContent: tab.content,
            conflictedPreview: tab.content,
          });
        });
      }
    });
    row.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      showFileMenu(id, ev.clientX, ev.clientY);
    });
    return row;
  }

  function showFolderMenu(folder: WorkspaceFolder, x: number, y: number): void {
    closeMenus();
    const menu = document.createElement('div');
    menu.className = 'workspace-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    const items: Array<[string, () => void]> = [
      ['New folder', () => {
        const name = window.prompt('Folder name');
        if (name?.trim()) addFolder(name.trim(), folder.id);
      }],
      ['Import folder…', () => {
        if (!canEditActiveWorkspace()) return;
        emit('import-directory');
      }],
      ['Rename', () => {
        const name = window.prompt('Rename folder', folder.name);
        if (name?.trim()) renameFolder(folder.id, name.trim());
      }],
      ['Move to parent…', () => {
        const parent = window.prompt('Parent folder id (empty = root)', folder.parentId ?? '');
        if (parent === null) return;
        moveFolder(folder.id, parent.trim() || null);
      }],
      ['Link GitHub repo', () => linkRepo(folder)],
      ['Replace GitHub link', () => linkRepo(folder)],
      ['Refresh index', () => refreshIndex(folder).catch(err => setStatus(err.message))],
      ['Unlink repo', () => setFolderRepoLink(folder.id, null)],
      ['Delete…', () => confirmDelete(folder)],
    ];
    for (const [label, fn] of items) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => { closeMenus(); fn(); });
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', closeMenus, { once: true }), 0);
  }

  function showFileMenu(tabId: string, x: number, y: number): void {
    closeMenus();
    const menu = document.createElement('div');
    menu.className = 'workspace-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    const open = document.createElement('button');
    open.textContent = 'Open';
    open.addEventListener('click', () => { closeMenus(); switchTab(tabId); });
    menu.appendChild(open);
    const move = document.createElement('button');
    move.textContent = 'Move to folder…';
    move.addEventListener('click', () => {
      closeMenus();
      const id = window.prompt('Folder id (empty = Unfiled)');
      if (id === null) return;
      setTabFolder(tabId, id.trim() || null);
    });
    menu.appendChild(move);
    const saveGh = document.createElement('button');
    saveGh.textContent = 'Save to GitHub';
    saveGh.addEventListener('click', () => { closeMenus(); saveTabToGithub(tabId).catch(err => setStatus(err.message)); });
    menu.appendChild(saveGh);
    if (isDriveConnectorEnabled()) {
      const saveDrive = document.createElement('button');
      saveDrive.textContent = 'Export to Drive';
      saveDrive.addEventListener('click', async () => {
        closeMenus();
        const result = await driveConnector.exportFile({ content: '', path: '', message: '' });
        if (result.ok) {
          setStatus('Saved');
        } else {
          setStatus(result.error);
          if (result.code === 'NOT_IMPLEMENTED') window.alert(result.error);
        }
      });
      menu.appendChild(saveDrive);
    }
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', closeMenus, { once: true }), 0);
  }

  function confirmDelete(folder: WorkspaceFolder): void {
    const overlay = document.createElement('div');
    overlay.className = 'workspace-modal-overlay';
    overlay.innerHTML = `
      <div class="workspace-modal">
        <p>Delete folder “${escapeHtml(folder.name)}”? Linked GitHub files will not be deleted remotely.</p>
        <div class="workspace-modal-actions">
          <button data-mode="reparent">Move contents to parent</button>
          <button data-mode="delete-contents">Delete contents</button>
          <button data-mode="cancel">Cancel</button>
        </div>
      </div>`;
    overlay.addEventListener('click', (e) => {
      const mode = (e.target as HTMLElement).dataset.mode;
      if (!mode) return;
      overlay.remove();
      if (mode === 'cancel') return;
      deleteFolder(folder.id, mode === 'reparent' ? 'reparent' : 'delete-contents');
    });
    document.body.appendChild(overlay);
  }

  function linkRepo(folder: WorkspaceFolder): void {
    const ownerRepo = window.prompt('GitHub owner/repo', folder.repoLink ? `${folder.repoLink.owner}/${folder.repoLink.repo}` : '');
    if (!ownerRepo) return;
    const [owner, repo] = ownerRepo.split('/').map(s => s.trim());
    if (!owner || !repo) {
      setStatus('Expected owner/repo');
      return;
    }
    const ref = window.prompt('Ref (branch/tag/SHA, empty = default)', folder.repoLink?.ref ?? '') ?? '';
    const pathPrefix = window.prompt('Path prefix (optional)', folder.repoLink?.pathPrefix ?? '') ?? '';
    const link: GitHubRepoLink = { owner, repo };
    if (ref.trim()) link.ref = ref.trim();
    if (pathPrefix.trim()) {
      try {
        link.pathPrefix = normalizePathPrefix(pathPrefix.trim());
      } catch {
        setStatus('Invalid path prefix');
        return;
      }
    }
    setFolderRepoLink(folder.id, link);
    refreshIndex({ ...folder, repoLink: link }).catch(err => setStatus(err.message));
  }

  async function refreshIndex(folder: WorkspaceFolder): Promise<void> {
    const link = folder.repoLink;
    if (!link) return;
    if (!getGithubToken()) {
      setStatus('Stored GitHub link is shown. Authenticate to refresh the file list.');
      return;
    }
    setStatus('Refreshing repository index…');
    try {
      const files = await listMarkdownFiles(link.owner, link.repo, link.ref, link.pathPrefix);
      const fetchedAt = Date.now();
      const entries: RepoIndexEntry[] = files.map(f => ({ path: f.path, sha: f.sha, fetchedAt }));
      linkedCache.set(folder.id, entries);
      const ref = link.ref || 'default';
      await saveRepoIndex(repoIndexKey(link.owner, link.repo, ref, link.pathPrefix || ''), entries);
      setStatus(`Indexed ${entries.length} Markdown files.`);
      render();
    } catch (e) {
      const err = e as Error & { code?: string };
      setStatus(err.message);
    }
  }

  async function openLinkedFile(folder: WorkspaceFolder, file: RepoIndexEntry): Promise<void> {
    const link = folder.repoLink!;
    const ref = link.ref || 'HEAD';
    const existing = findTabByGithubPath(getState().tabs, {
      owner: link.owner,
      repo: link.repo,
      ref,
      path: file.path,
    });
    if (existing) {
      switchTab(existing.id);
      return;
    }
    const loaded = await getFileContent(link.owner, link.repo, file.path, ref);
    addTab(file.path.split('/').pop() || file.path, loaded.content, {
      folderId: folder.id,
      origin: {
        kind: 'github',
        owner: link.owner,
        repo: link.repo,
        ref,
        path: file.path,
        sha: loaded.sha,
      },
    });
  }

  function setStatus(msg: string): void {
    status.textContent = msg;
    console.warn('[workspace]', msg);
  }
}

function closeMenus(): void {
  document.querySelectorAll('.workspace-menu').forEach(n => n.remove());
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export async function hydrateRepoIndexes(): Promise<void> {
  for (const folder of getState().folders) {
    const link = folder.repoLink;
    if (!link) continue;
    const key = repoIndexKey(link.owner, link.repo, link.ref || 'default', link.pathPrefix || '');
    const cached = await loadRepoIndex(key);
    if (cached) linkedCache.set(folder.id, cached);
  }
}

export async function saveTabToGithub(tabId: string): Promise<void> {
  const tab = getState().tabs.find(t => t.id === tabId);
  if (!tab) return;
  if (!getGithubToken()) {
    window.alert('GitHub write requires sign-in with write access or a PAT in Settings. No unauthenticated write was attempted.');
    return;
  }
  let owner: string | undefined;
  let repo: string | undefined;
  let ref: string | undefined;
  let path: string | undefined;
  if (tab.origin.kind === 'github') {
    owner = tab.origin.owner;
    repo = tab.origin.repo;
    ref = tab.origin.ref;
    path = tab.origin.path;
  } else {
    const target = window.prompt('Save target as owner/repo/path (required)');
    if (!target) return;
    const parts = target.split('/');
    owner = parts[0];
    repo = parts[1];
    path = parts.slice(2).join('/');
    ref = window.prompt('Ref (branch)', 'main') || '';
    if (!owner || !repo || !path || !ref) {
      window.alert('owner, repo, path, and ref are required.');
      return;
    }
  }
  const message = window.prompt('Commit message', `Update ${path}`) || `Update ${path}`;
  const result = await githubConnector.exportFile({
    content: tab.content,
    path: path!,
    message,
    origin: tab.origin,
    target: { owner: owner!, repo: repo!, ref: ref! },
  });
  if (!result.ok) {
    window.alert(result.error);
    return;
  }
  updateTabOrigin(tab.id, {
    kind: 'github',
    owner: owner!,
    repo: repo!,
    ref: ref!,
    path: path!,
    sha: result.sha,
  });
  setTabDirty(tab.id, false);
}

export function moveTabToFolder(tabId: string, folderId: FolderId | null): void {
  setTabFolder(tabId, folderId);
}
