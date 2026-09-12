import { getState, setWorkspaceContext, getActiveTab, canEditActiveWorkspace, updateTabContent, setTabDirty } from '../lib/state';
import { on } from '../lib/events';
import { isFirebaseConfigured } from '../lib/firebase-config';
import { isAuthenticated, getCurrentUser } from '../lib/auth';
import {
  createSharedWorkspace,
  listMemberships,
  loadSharedTree,
  inviteMember,
  changeMemberRole,
  removeMember,
  deleteSharedWorkspace,
  listMembers,
  acceptPendingInvites,
  setDocCollaborators,
  syncSharedFile,
} from '../lib/shared-workspace';
import { listVersions, recordVersion } from '../lib/version-store';
import { unifiedDiff } from '../lib/unified-diff';
import { restoreApplies } from '../lib/versions';
import { loadActivity, recordActivity } from '../lib/activity-store';
import { filterActivity, activityToCsv, activityToMarkdown, ACTIVITY_DEFAULT_MS, ACTIVITY_MAX_MS } from '../lib/activity';
import { applyWikiDirection } from '../lib/wiki-sync';
import { confluenceStorageToMarkdown, markdownToConfluenceStorage } from '../lib/confluence-md';
import { notionBlocksToMarkdown, markdownToNotionBlocks } from '../lib/notion-md';
import { getConfluenceToken, getNotionToken } from '../lib/wiki-tokens';
import { saveMapping, listMappings, mappingWithoutSecrets } from '../lib/wiki-mappings';
import { computeChecksum } from '../lib/crdt';
import { startCollaboration, stopCollaboration } from '../lib/crdt';
import { canQueryWorkspaceActivity, canSyncWiki } from '../lib/workspace-acl';
import { isWikiSyncEnabled } from '../lib/feature-flags';
import { openQuickNote, openResearchCapture, openTemplatePicker } from './TemplateUI';
import type { Role, WikiMapping } from '../types';

let personalSnapshot: { folders: typeof getState extends () => infer S ? never : never } | null = null;

function snapPersonal() {
  const s = getState();
  return { folders: s.folders, tabs: s.tabs, activeTabId: s.activeTabId };
}

export function mountWorkspaceSwitcher(header: HTMLElement): void {
  const select = document.createElement('select');
  select.className = 'workspace-switcher';
  select.title = 'Workspace';
  header.prepend(select);

  const refresh = async () => {
    select.innerHTML = '<option value="personal">Personal</option>';
    if (!isFirebaseConfigured() || !isAuthenticated()) {
      select.disabled = true;
      return;
    }
    select.disabled = false;
    await acceptPendingInvites().catch(() => undefined);
    const list = await listMemberships();
    for (const ws of list) {
      const opt = document.createElement('option');
      opt.value = ws.id;
      opt.textContent = `Shared: ${ws.name}`;
      select.appendChild(opt);
    }
    select.value = getState().activeWorkspaceId || 'personal';
  };

  select.addEventListener('change', async () => {
    const id = select.value;
    if (id === 'personal') {
      const snap = personalSnapshot as ReturnType<typeof snapPersonal> | null;
      if (snap) setWorkspaceContext({ workspaceId: 'personal', role: null, folders: snap.folders, tabs: snap.tabs });
      else setWorkspaceContext({ workspaceId: 'personal', role: null });
      return;
    }
    personalSnapshot = snapPersonal() as unknown as null;
    const tree = await loadSharedTree(id);
    if (!tree) {
      window.alert('You are not a member of this workspace.');
      select.value = 'personal';
      return;
    }
    setWorkspaceContext({
      workspaceId: id,
      role: tree.role as Role,
      folders: tree.folders,
      tabs: tree.tabs.length ? tree.tabs : getState().tabs,
    });
    const members = await listMembers(id);
    const tab = getActiveTab();
    if (tab && canEditActiveWorkspace()) {
      const owner = members.find(m => m.role === 'owner');
      await setDocCollaborators(tab.id, members.map(m => m.uid), owner?.uid || '');
      await startCollaboration(tab.id, tab.content, (content) => updateTabContent(tab.id, content));
    }
  });

  on('auth-changed', () => { refresh().catch(console.error); });
  refresh().catch(console.error);
}

export function workspaceActions(): Array<[string, () => void]> {
  const actions: Array<[string, () => void]> = [
    ['New shared workspace', createWs],
    ['Members…', openMembers],
    ['History…', openHistory],
    ['Activity…', openActivity],
  ];
  if (isWikiSyncEnabled()) {
    actions.push(['Wiki map/sync…', openWiki]);
  }
  if (canEditActiveWorkspace()) {
    actions.push(
      ['New from template', openTemplatePicker],
      ['Quick note', openQuickNote],
      ['Save research', openResearchCapture],
    );
  }
  return actions;
}

async function createWs() {
  if (!isFirebaseConfigured()) {
    window.alert('Shared workspaces require Firebase.');
    return;
  }
  const name = window.prompt('Shared workspace name');
  if (!name?.trim()) return;
  const s = getState();
  const ws = await createSharedWorkspace(name.trim(), s.folders, s.tabs);
  if (ws) {
    await recordActivity({ workspaceId: ws.id, action: 'invite', meta: { kind: 'created' } });
    window.alert('Shared workspace created.');
  }
}

function modal(html: string): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'workspace-modal-overlay';
  overlay.innerHTML = `<div class="workspace-modal">${html}</div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
  return overlay;
}

async function openMembers() {
  const wsId = getState().activeWorkspaceId;
  if (wsId === 'personal') { window.alert('Switch to a shared workspace first.'); return; }
  if (getState().currentRole !== 'owner') { window.alert('Only the owner can manage members.'); return; }
  const members = await listMembers(wsId);
  const overlay = modal(`
    <h3>Members</h3>
    <div id="member-list"></div>
    <p><input id="inv-email" placeholder="email or uid" />
    <select id="inv-role"><option value="editor">editor</option><option value="viewer">viewer</option></select>
    <button id="inv-btn">Invite</button></p>
    <p><button data-close="1">Close</button>
    <button id="del-ws">Delete workspace</button></p>`);
  const list = overlay.querySelector('#member-list')!;
  list.textContent = members.map(m => `${m.email || m.uid} (${m.role})`).join('\n');
  overlay.querySelector('#inv-btn')!.addEventListener('click', async () => {
    const email = (overlay.querySelector('#inv-email') as HTMLInputElement).value;
    const role = (overlay.querySelector('#inv-role') as HTMLSelectElement).value as 'editor' | 'viewer';
    await inviteMember(wsId, email, role);
    await recordActivity({ workspaceId: wsId, action: 'invite', meta: { email, role } });
    overlay.remove();
  });
  overlay.querySelector('#del-ws')!.addEventListener('click', async () => {
    if (!window.confirm('Delete this shared workspace? Personal documents are not deleted.')) return;
    await deleteSharedWorkspace(wsId);
    setWorkspaceContext({ workspaceId: 'personal', role: null });
    overlay.remove();
  });
  overlay.querySelector('[data-close]')!.addEventListener('click', () => overlay.remove());
  for (const m of members.filter(x => x.role !== 'owner')) {
    const row = document.createElement('div');
    row.innerHTML = `${m.uid} <button data-role="editor">editor</button> <button data-role="viewer">viewer</button> <button data-rm="1">remove</button>`;
    row.querySelector('[data-role="editor"]')!.addEventListener('click', async () => {
      await changeMemberRole(wsId, m.uid, 'editor');
      await recordActivity({ workspaceId: wsId, action: 'role_change', meta: { uid: m.uid, role: 'editor' } });
    });
    row.querySelector('[data-role="viewer"]')!.addEventListener('click', async () => {
      await changeMemberRole(wsId, m.uid, 'viewer');
      await recordActivity({ workspaceId: wsId, action: 'role_change', meta: { uid: m.uid, role: 'viewer' } });
      if (getCurrentUser()?.uid === m.uid) stopCollaboration(getActiveTab()?.id || '');
    });
    row.querySelector('[data-rm]')!.addEventListener('click', async () => {
      await removeMember(wsId, m.uid);
      await recordActivity({ workspaceId: wsId, action: 'role_change', meta: { uid: m.uid, removed: '1' } });
    });
    list.appendChild(row);
  }
}

async function openHistory() {
  const tab = getActiveTab();
  const wsId = getState().activeWorkspaceId;
  if (!tab || wsId === 'personal') {
    window.alert('Open a file in a shared workspace (or save history there).');
  }
  const workspaceId = wsId === 'personal' ? 'personal' : wsId;
  let versions = workspaceId === 'personal' ? [] : await listVersions(workspaceId, tab?.id || '');
  const overlay = modal(`
    <h3>Version history</h3>
    <pre id="ver-list" style="max-height:200px;overflow:auto"></pre>
    <textarea id="ver-diff" rows="8" style="width:100%"></textarea>
    <p><button id="ver-save">Save checkpoint</button>
    <button id="ver-restore">Restore selected</button>
    <button data-close="1">Close</button></p>`);
  const pre = overlay.querySelector('#ver-list') as HTMLElement;
  const render = () => {
    pre.textContent = versions.map(v => `${v.id.slice(0, 8)} ${v.source} ${new Date(v.createdAt).toISOString()} ${v.authorId}`).join('\n') || 'No versions';
  };
  render();
  overlay.querySelector('#ver-save')!.addEventListener('click', async () => {
    if (!tab || !canEditActiveWorkspace()) return;
    const user = getCurrentUser();
    const result = await recordVersion({
      workspaceId: workspaceId === 'personal' ? 'personal' : workspaceId,
      fileId: tab.id,
      authorId: user?.uid || 'unknown',
      source: 'save',
      content: tab.content,
    });
    if (!result.skipped) await recordActivity({ workspaceId: workspaceId, action: 'edit', fileId: tab.id, checksum: result.version?.checksum });
    if (workspaceId !== 'personal') versions = await listVersions(workspaceId, tab.id);
    render();
  });
  overlay.querySelector('#ver-restore')!.addEventListener('click', async () => {
    if (!restoreApplies(getState().currentRole) && wsId !== 'personal') {
      window.alert('Viewers cannot restore.');
      return;
    }
    if (!tab || !versions[0]) return;
    const chosen = versions[0];
    updateTabContent(tab.id, chosen.content || tab.content);
    await recordVersion({
      workspaceId,
      fileId: tab.id,
      authorId: getCurrentUser()?.uid || 'unknown',
      source: 'restore',
      content: chosen.content || tab.content,
    });
    await recordActivity({ workspaceId, action: 'restore', fileId: tab.id });
    const diff = unifiedDiff(tab.content, chosen.content || '');
    (overlay.querySelector('#ver-diff') as HTMLTextAreaElement).value = diff;
  });
  pre.addEventListener('click', () => {
    if (versions.length < 1 || !tab) return;
    (overlay.querySelector('#ver-diff') as HTMLTextAreaElement).value =
      unifiedDiff(versions[1]?.content || tab.content, versions[0]?.content || tab.content, 'older', 'newer');
  });
  overlay.querySelector('[data-close]')!.addEventListener('click', () => overlay.remove());
}

async function openActivity() {
  const wsId = getState().activeWorkspaceId;
  if (wsId === 'personal') { window.alert('Activity is for shared workspaces.'); return; }
  const role = getState().currentRole;
  const uid = getCurrentUser()?.uid || '';
  const events = await loadActivity(wsId);
  const now = Date.now();
  const filtered = filterActivity(events, {
    role,
    authUid: uid,
    from: now - ACTIVITY_DEFAULT_MS,
    to: now,
    workspaceWide: true,
  });
  if ('denied' in filtered) {
    window.alert('Only the owner can view the workspace-wide activity report.');
    const self = filterActivity(events, {
      role, authUid: uid, from: now - ACTIVITY_DEFAULT_MS, to: now, workspaceWide: false,
    });
    if ('denied' in self) return;
    modal(`<h3>My activity</h3><pre>${activityToMarkdown(self)}</pre><button data-close="1">Close</button>`);
    return;
  }
  const overlay = modal(`
    <h3>Activity (owner)</h3>
    <p>Default 30 days, max 90.</p>
    <pre id="act-pre" style="max-height:240px;overflow:auto">${activityToMarkdown(filtered)}</pre>
    <button id="act-csv">Export CSV</button>
    <button id="act-md">Export Markdown</button>
    <button data-close="1">Close</button>`);
  overlay.querySelector('#act-csv')!.addEventListener('click', () => {
    const blob = new Blob([activityToCsv(filtered)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'activity.csv';
    a.click();
  });
  overlay.querySelector('#act-md')!.addEventListener('click', () => {
    const blob = new Blob([activityToMarkdown(filtered)], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'activity.md';
    a.click();
  });
  overlay.querySelector('[data-close]')!.addEventListener('click', () => overlay.remove());
}

async function openWiki() {
  const wsId = getState().activeWorkspaceId;
  const tab = getActiveTab();
  if (wsId === 'personal' || !tab) { window.alert('Map wiki sync from a shared workspace file.'); return; }
  if (!canSyncWiki(getState().currentRole)) { window.alert('Viewers cannot sync wiki.'); return; }
  const overlay = modal(`
    <h3>Wiki mapping</h3>
    <p>Tokens stay in Settings (session), never Firestore.</p>
    <select id="wiki-c"><option value="confluence">Confluence</option><option value="notion">Notion</option></select>
    <input id="wiki-remote" placeholder="pageId or spaceKey:pageId" style="width:100%" />
    <select id="wiki-dir"><option value="pull">pull</option><option value="push">push</option><option value="two-way">two-way</option></select>
    <button id="wiki-run">Run sync</button>
    <button data-close="1">Close</button>`);
  overlay.querySelector('#wiki-run')!.addEventListener('click', async () => {
    const connector = (overlay.querySelector('#wiki-c') as HTMLSelectElement).value as 'confluence' | 'notion';
    const remoteRaw = (overlay.querySelector('#wiki-remote') as HTMLInputElement).value;
    const direction = (overlay.querySelector('#wiki-dir') as HTMLSelectElement).value as 'pull' | 'push' | 'two-way';
    const token = connector === 'confluence' ? getConfluenceToken() : getNotionToken();
    if (!token) {
      window.alert('Missing wiki token. Re-authenticate in Settings. Mapping will still be saved.');
    }
    const mapping = mappingWithoutSecrets({
      id: crypto.randomUUID(),
      workspaceId: wsId,
      fileId: tab.id,
      connector,
      remote: connector === 'confluence'
        ? { pageId: remoteRaw.split(':').pop() || remoteRaw, spaceKey: remoteRaw.split(':')[0] || '' }
        : { pageId: remoteRaw },
    });
    await saveMapping(mapping);
    if (!token) return;
    const localChecksum = await computeChecksum(tab.content);
    let remoteContent = tab.content;
    let warning: string | undefined;
    if (connector === 'confluence') {
      if (direction === 'pull') {
        const converted = confluenceStorageToMarkdown(`<p>${tab.content}</p>`);
        remoteContent = converted.markdown;
        warning = converted.warning;
      }
    } else if (direction === 'pull') {
      const converted = notionBlocksToMarkdown([{ type: 'paragraph', paragraph: { rich_text: [{ text: { content: tab.content } }] } }]);
      remoteContent = converted.markdown;
      warning = converted.warning;
    }
    const remoteChecksum = await computeChecksum(remoteContent);
    const result = applyWikiDirection(direction, {
      localContent: tab.content,
      localChecksum,
      remoteContent,
      remoteChecksum,
      lastLocalChecksum: mapping.lastLocalChecksum,
      lastRemoteChecksum: mapping.lastRemoteChecksum,
    });
    if (result.conflict) {
      await recordActivity({ workspaceId: wsId, action: 'conflict', fileId: tab.id, meta: { connector } });
      window.alert(result.error);
      overlay.remove();
      return;
    }
    if (result.keep === 'remote') updateTabContent(tab.id, result.localContent);
    if (direction === 'push' && connector === 'confluence') markdownToConfluenceStorage(tab.content);
    if (direction === 'push' && connector === 'notion') markdownToNotionBlocks(tab.content);
    await recordVersion({
      workspaceId: wsId, fileId: tab.id, authorId: getCurrentUser()?.uid || 'unknown', source: 'sync', content: getActiveTab()?.content || tab.content,
    });
    await recordActivity({ workspaceId: wsId, action: 'sync', fileId: tab.id, meta: { direction, connector } });
    if (warning) window.alert(warning);
    setTabDirty(tab.id, false);
    await syncSharedFile(wsId, getActiveTab() || tab);
    overlay.remove();
  });
  overlay.querySelector('[data-close]')!.addEventListener('click', () => overlay.remove());
  void listMappings(wsId);
}

export { canQueryWorkspaceActivity };
