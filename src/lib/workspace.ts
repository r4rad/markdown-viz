import type { FileOrigin, FileTab, FolderId, GitHubRepoLink, WorkspaceFolder } from '../types';

export const LOCAL_ORIGIN: FileOrigin = { kind: 'local' };

export function migrateTab(tab: Partial<FileTab> & Pick<FileTab, 'id' | 'name' | 'content'>): FileTab {
  const origin = tab.origin?.kind === 'github' ? tab.origin : LOCAL_ORIGIN;
  return {
    id: tab.id,
    name: tab.name,
    content: tab.content ?? '',
    cursorPos: tab.cursorPos ?? 0,
    scrollTop: tab.scrollTop ?? 0,
    scrollPreview: tab.scrollPreview ?? 0,
    dirty: tab.dirty ?? false,
    updatedAt: tab.updatedAt ?? Date.now(),
    createdAt: tab.createdAt ?? Date.now(),
    folderId: tab.folderId ?? null,
    origin,
  };
}

export function migrateTabs(tabs: Array<Partial<FileTab> & Pick<FileTab, 'id' | 'name' | 'content'>>): FileTab[] {
  return tabs.map(migrateTab);
}

export function createFolder(
  folders: WorkspaceFolder[],
  input: { name: string; parentId: FolderId | null; id?: string; now?: number },
): WorkspaceFolder[] {
  const now = input.now ?? Date.now();
  const name = input.name.trim();
  if (!name) throw new Error('Folder name is required');
  if (input.parentId && !folders.some(f => f.id === input.parentId)) {
    throw new Error('Parent folder not found');
  }
  const folder: WorkspaceFolder = {
    id: input.id ?? crypto.randomUUID(),
    name,
    parentId: input.parentId,
    createdAt: now,
    updatedAt: now,
    repoLink: null,
  };
  return [...folders, folder];
}

export function renameFolder(folders: WorkspaceFolder[], id: FolderId, name: string, now = Date.now()): WorkspaceFolder[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name is required');
  return folders.map(f => f.id === id ? { ...f, name: trimmed, updatedAt: now } : f);
}

export function moveFolder(folders: WorkspaceFolder[], id: FolderId, newParentId: FolderId | null, now = Date.now()): WorkspaceFolder[] {
  if (id === newParentId) throw new Error('Cannot move a folder into itself');
  if (newParentId && !folders.some(f => f.id === newParentId)) throw new Error('Parent folder not found');
  if (newParentId && isDescendant(folders, id, newParentId)) {
    throw new Error('Cannot move a folder into its descendant');
  }
  return folders.map(f => f.id === id ? { ...f, parentId: newParentId, updatedAt: now } : f);
}

export function isDescendant(folders: WorkspaceFolder[], ancestorId: FolderId, nodeId: FolderId): boolean {
  let current: FolderId | null = nodeId;
  const seen = new Set<FolderId>();
  while (current) {
    if (current === ancestorId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = folders.find(f => f.id === current)?.parentId ?? null;
  }
  return false;
}

export function descendantFolderIds(folders: WorkspaceFolder[], rootId: FolderId): FolderId[] {
  const ids = new Set<FolderId>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        added = true;
      }
    }
  }
  return [...ids];
}

export type DeleteFolderMode = 'delete-contents' | 'reparent';

export function deleteFolder(
  folders: WorkspaceFolder[],
  tabs: FileTab[],
  id: FolderId,
  mode: DeleteFolderMode,
  now = Date.now(),
): { folders: WorkspaceFolder[]; tabs: FileTab[]; removedTabIds: string[] } {
  const target = folders.find(f => f.id === id);
  if (!target) return { folders, tabs, removedTabIds: [] };

  const subtree = new Set(descendantFolderIds(folders, id));
  const parentId = target.parentId;

  if (mode === 'reparent') {
    const nextFolders = folders
      .filter(f => f.id !== id)
      .map(f => {
        if (f.parentId === id) return { ...f, parentId, updatedAt: now };
        return f;
      });
    const nextTabs = tabs.map(t => t.folderId === id ? { ...t, folderId: parentId, updatedAt: now } : t);
    return { folders: nextFolders, tabs: nextTabs, removedTabIds: [] };
  }

  const nextFolders = folders.filter(f => !subtree.has(f.id));
  const removedTabIds = tabs.filter(t => t.folderId && subtree.has(t.folderId)).map(t => t.id);
  const nextTabs = tabs.filter(t => !(t.folderId && subtree.has(t.folderId)));
  return { folders: nextFolders, tabs: nextTabs, removedTabIds };
}

export function setFolderRepoLink(
  folders: WorkspaceFolder[],
  id: FolderId,
  repoLink: GitHubRepoLink | null,
  now = Date.now(),
): WorkspaceFolder[] {
  return folders.map(f => f.id === id ? { ...f, repoLink, updatedAt: now } : f);
}

export function setTabFolder(tabs: FileTab[], tabId: string, folderId: FolderId | null, now = Date.now()): FileTab[] {
  return tabs.map(t => t.id === tabId ? { ...t, folderId, updatedAt: now } : t);
}

export function githubOriginKey(origin: Extract<FileOrigin, { kind: 'github' }>): string {
  return `github:${origin.owner}/${origin.repo}@${origin.ref}:${origin.path}`;
}

export function findTabByGithubPath(
  tabs: FileTab[],
  origin: Pick<Extract<FileOrigin, { kind: 'github' }>, 'owner' | 'repo' | 'ref' | 'path'>,
): FileTab | undefined {
  return tabs.find(t =>
    t.origin.kind === 'github'
    && t.origin.owner === origin.owner
    && t.origin.repo === origin.repo
    && t.origin.ref === origin.ref
    && t.origin.path === origin.path,
  );
}

export function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.markdown');
}

export function assertSafePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some(seg => seg === '..' || seg === '.')) {
    throw new Error('Invalid path');
  }
  return normalized;
}

export function normalizePathPrefix(prefix?: string): string {
  if (!prefix) return '';
  return assertSafePath(prefix).replace(/\/+$/, '');
}
