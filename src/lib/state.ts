import type { AppState, FileOrigin, FileTab, FolderId, GitHubRepoLink, Role, WorkspaceFolder } from '../types';
import { emit } from './events';
import { canWriteWorkspace } from './workspace-acl';
import { emptyTemplateSettings } from './template-folders';
import {
  LOCAL_ORIGIN,
  createFolder as createFolderRecord,
  deleteFolder as deleteFolderRecords,
  migrateTabs,
  moveFolder as moveFolderRecord,
  renameFolder as renameFolderRecord,
  setFolderRepoLink as setFolderRepoLinkRecord,
  setTabFolder as setTabFolderRecord,
  type DeleteFolderMode,
} from './workspace';

const DEFAULT_CONTENT = `# Welcome to MarkdownViz

Start typing your **Markdown** here. The preview updates live.

## Features

- 📝 Rich editor with syntax highlighting
- 👁️ Live preview with GitHub-style rendering
- 🎨 VS Code-like theme system
- 📊 Mermaid & Graphviz diagram support
- 🔍 Zoom into diagrams
- 💾 Multi-tab with session persistence
- 🌙 Dark & light modes
- ✨ Markdown beautifier
- 📤 Export to MD, HTML, PDF

## Try a Mermaid Diagram

\`\`\`mermaid
graph TD
    A[Start Editing] --> B{Choose Format}
    B -->|Markdown| C[Write Content]
    B -->|Diagram| D[Draw Diagrams]
    C --> E[Preview Live]
    D --> E
    E --> F[Export]
\`\`\`

## Code Example

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}! Welcome to MarkdownViz.\`;
}
\`\`\`

## Math Support

Inline math: $E = mc^2$

Block math:

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$
`;

function generateUntitledName(): string {
  const names = new Set(state.tabs.map(t => t.name.toLowerCase()));
  if (!names.has('untitled-1.md')) return 'untitled-1.md';
  let n = 2;
  while (names.has(`untitled-${n}.md`)) n++;
  return `untitled-${n}.md`;
}

function createTab(
  name = 'untitled-1.md',
  content = DEFAULT_CONTENT,
  extras?: { folderId?: FolderId | null; origin?: FileOrigin },
): FileTab {
  return {
    id: crypto.randomUUID(),
    name,
    content,
    cursorPos: 0,
    scrollTop: 0,
    scrollPreview: 0,
    dirty: false,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    folderId: extras?.folderId ?? null,
    origin: extras?.origin ?? LOCAL_ORIGIN,
  };
}

const initialTab = createTab();

const state: AppState = {
  tabs: [initialTab],
  activeTabId: initialTab.id,
  theme: 'github-dark',
  syncScroll: true,
  showPreview: true,
  showEditor: true,
  sidebarOpen: false,
  folders: [],
  activeWorkspaceId: 'personal',
  currentRole: null,
  templateSettings: emptyTemplateSettings(),
};

export function canEditActiveWorkspace(): boolean {
  if (state.activeWorkspaceId === 'personal' || !state.currentRole) return true;
  return canWriteWorkspace(state.currentRole);
}

function rejectViewerWrite(): boolean {
  if (canEditActiveWorkspace()) return false;
  emit('workspace-error', 'Viewers cannot edit this shared workspace.');
  return true;
}

export function setWorkspaceContext(input: {
  workspaceId: string;
  role: Role | null;
  folders?: WorkspaceFolder[];
  tabs?: FileTab[];
}): void {
  state.activeWorkspaceId = input.workspaceId;
  state.currentRole = input.role;
  if (input.folders) state.folders = input.folders;
  if (input.tabs?.length) {
    state.tabs = input.tabs;
    state.activeTabId = input.tabs[0].id;
  }
  emit('state-changed', state);
  emit('active-tab-changed', getActiveTab());
}

export function getState(): Readonly<AppState> {
  return state;
}

export function getActiveTab(): FileTab | null {
  return state.tabs.find(t => t.id === state.activeTabId) ?? null;
}

export function setTheme(themeId: string): void {
  state.theme = themeId;
  emit('theme-changed', themeId);
  emit('state-changed', state);
}

export function addTab(
  name?: string,
  content?: string,
  extras?: { folderId?: FolderId | null; origin?: FileOrigin; id?: string },
): FileTab {
  const resolvedName = name ?? generateUntitledName();
  const tab = createTab(resolvedName, content ?? '', extras);
  if (extras?.id) tab.id = extras.id;
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  emit('tab-added', tab);
  emit('active-tab-changed', tab);
  emit('state-changed', state);
  return tab;
}

export function closeTab(id: string): void {
  const idx = state.tabs.findIndex(t => t.id === id);
  if (idx < 0) return;
  state.tabs.splice(idx, 1);
  if (state.activeTabId === id) {
    const next = state.tabs[Math.min(idx, state.tabs.length - 1)];
    state.activeTabId = next?.id ?? null;
    if (!next) {
      const tab = addTab();
      state.activeTabId = tab.id;
    }
    emit('active-tab-changed', getActiveTab());
  }
  emit('tab-closed', id);
  emit('state-changed', state);
}

export function switchTab(id: string): void {
  if (!state.tabs.find(t => t.id === id)) return;
  state.activeTabId = id;
  emit('active-tab-changed', getActiveTab());
  emit('state-changed', state);
}

export function updateTabContent(id: string, content: string): void {
  if (rejectViewerWrite()) return;
  const tab = state.tabs.find(t => t.id === id);
  if (!tab) return;
  tab.content = content;
  tab.dirty = true;
  tab.updatedAt = Date.now();
  emit('content-changed', { id, content });
}

export function updateTabCursor(id: string, pos: number, scrollTop: number): void {
  const tab = state.tabs.find(t => t.id === id);
  if (!tab) return;
  tab.cursorPos = pos;
  tab.scrollTop = scrollTop;
}

export function updateTabName(id: string, name: string): void {
  if (rejectViewerWrite()) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  const tab = state.tabs.find(t => t.id === id);
  if (!tab) return;
  tab.name = trimmed;
  emit('tab-renamed', { id, name: trimmed });
  emit('state-changed', state);
}

export function setPreviewScroll(id: string, scrollTop: number): void {
  const tab = state.tabs.find(t => t.id === id);
  if (tab) tab.scrollPreview = scrollTop;
}

export function toggleSyncScroll(): void {
  state.syncScroll = !state.syncScroll;
  emit('sync-scroll-changed', state.syncScroll);
}

export function togglePreview(): void {
  state.showPreview = !state.showPreview;
  if (!state.showPreview && !state.showEditor) state.showEditor = true;
  emit('layout-changed', state);
}

export function toggleEditor(): void {
  state.showEditor = !state.showEditor;
  if (!state.showEditor && !state.showPreview) state.showPreview = true;
  emit('layout-changed', state);
}

export function restoreState(saved: Partial<AppState>): void {
  if (saved.tabs?.length) {
    state.tabs = migrateTabs(saved.tabs as Parameters<typeof migrateTabs>[0]);
    state.activeTabId = saved.activeTabId ?? saved.tabs[0].id;
  }
  if (saved.folders) state.folders = saved.folders;
  if (saved.theme) state.theme = saved.theme;
  if (saved.syncScroll !== undefined) state.syncScroll = saved.syncScroll;
  if (saved.sidebarOpen !== undefined) state.sidebarOpen = saved.sidebarOpen;
  if (saved.templateSettings) state.templateSettings = saved.templateSettings;
  emit('state-restored', state);
  emit('theme-changed', state.theme);
  emit('active-tab-changed', getActiveTab());
}

export function toggleSidebar(): void {
  state.sidebarOpen = !state.sidebarOpen;
  emit('layout-changed', state);
  emit('state-changed', state);
}

export function setTabDirty(id: string, dirty: boolean): void {
  const tab = state.tabs.find(t => t.id === id);
  if (!tab) return;
  tab.dirty = dirty;
  emit('state-changed', state);
}

export function updateTabOrigin(id: string, origin: FileOrigin): void {
  const tab = state.tabs.find(t => t.id === id);
  if (!tab) return;
  tab.origin = origin;
  emit('state-changed', state);
}

export function setTabFolder(tabId: string, folderId: FolderId | null): void {
  state.tabs = setTabFolderRecord(state.tabs, tabId, folderId);
  emit('state-changed', state);
}

export function addFolder(name: string, parentId: FolderId | null): WorkspaceFolder {
  if (rejectViewerWrite()) return state.folders[state.folders.length - 1];
  state.folders = createFolderRecord(state.folders, { name, parentId });
  const folder = state.folders[state.folders.length - 1];
  emit('state-changed', state);
  return folder;
}

export function renameFolder(id: FolderId, name: string): void {
  if (rejectViewerWrite()) return;
  state.folders = renameFolderRecord(state.folders, id, name);
  emit('state-changed', state);
}

export function moveFolder(id: FolderId, newParentId: FolderId | null): void {
  state.folders = moveFolderRecord(state.folders, id, newParentId);
  emit('state-changed', state);
}

export function deleteFolder(id: FolderId, mode: DeleteFolderMode): string[] {
  if (rejectViewerWrite()) return [];
  const result = deleteFolderRecords(state.folders, state.tabs, id, mode);
  state.folders = result.folders;
  state.tabs = result.tabs;
  if (result.removedTabIds.includes(state.activeTabId ?? '')) {
    state.activeTabId = state.tabs[0]?.id ?? null;
    if (!state.tabs.length) {
      const tab = addTab();
      state.activeTabId = tab.id;
    }
    emit('active-tab-changed', getActiveTab());
  }
  emit('state-changed', state);
  return result.removedTabIds;
}

export function setFolderRepoLink(id: FolderId, repoLink: GitHubRepoLink | null): void {
  state.folders = setFolderRepoLinkRecord(state.folders, id, repoLink);
  emit('state-changed', state);
}

export function replaceFolders(folders: WorkspaceFolder[]): void {
  state.folders = folders;
  emit('state-changed', state);
}

export function setTemplateSettings(settings: import('../types').TemplateSettings): void {
  state.templateSettings = settings;
  emit('state-changed', state);
}
