import type { AppState, FileTab } from '../types';
import { emit } from './events';

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

function createTab(name = 'untitled-1.md', content = DEFAULT_CONTENT): FileTab {
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
};

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

export function addTab(name?: string, content?: string): FileTab {
  const resolvedName = name ?? generateUntitledName();
  const tab = createTab(resolvedName, content ?? '');
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
  const tab = state.tabs.find(t => t.id === id);
  if (!tab) return;
  tab.name = name;
  emit('tab-renamed', { id, name });
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
    state.tabs = saved.tabs;
    state.activeTabId = saved.activeTabId ?? saved.tabs[0].id;
  }
  if (saved.theme) state.theme = saved.theme;
  if (saved.syncScroll !== undefined) state.syncScroll = saved.syncScroll;
  emit('state-restored', state);
  emit('theme-changed', state.theme);
  emit('active-tab-changed', getActiveTab());
}
