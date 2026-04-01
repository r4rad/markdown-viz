import { createToolbar } from './Toolbar';
import { createTabBar } from './TabBar';
import { createEditor, getEditorView } from './Editor';
import { createPreview } from './Preview';
import { createStatusBar } from './StatusBar';
import { initDiagramModal } from './DiagramModal';
import { getState, addTab, restoreState, toggleEditor, togglePreview } from '../lib/state';
import { on, emit } from '../lib/events';
import { loadState, debouncedSave } from '../lib/storage';
import { applyTheme, getSavedTheme } from '../themes/themes';
import { setupImport, openFilePicker, importFromGitHubURL } from '../lib/import';
import { exportMarkdown, exportHTML, exportPDF } from '../lib/export';
import { beautifyMarkdown } from '../lib/beautifier';

export async function initApp(): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  app.className = 'app-container';

  // Apply saved theme
  const savedTheme = getSavedTheme();
  applyTheme(savedTheme);

  // Restore state from IndexedDB
  const saved = await loadState();
  if (saved) restoreState(saved);

  // Build UI
  const toolbar = createToolbar();
  const tabBar = createTabBar();
  const mainArea = document.createElement('div');
  mainArea.className = 'main-area';

  const editorPane = createEditor();
  const splitHandle = createSplitHandle(mainArea);
  const previewPane = createPreview();
  const statusBar = createStatusBar();

  mainArea.append(editorPane, splitHandle, previewPane);
  app.append(toolbar, tabBar, mainArea, statusBar);

  // Initialize subsystems
  initDiagramModal();
  setupImport();
  setupKeyboardShortcuts();

  // Wire up events
  on('import-file', () => openFilePicker());

  on('file-imported', (data: unknown) => {
    const { name, content } = data as { name: string; content: string };
    addTab(name, content);
  });

  on('export', (format: unknown) => {
    switch (format) {
      case 'md': exportMarkdown(); break;
      case 'html': exportHTML(); break;
      case 'pdf': exportPDF(); break;
    }
  });

  on('beautify', () => beautifyMarkdown());

  // Layout visibility
  on('layout-changed', () => {
    const state = getState();
    editorPane.classList.toggle('pane-hidden', !state.showEditor);
    previewPane.classList.toggle('pane-hidden', !state.showPreview);
    splitHandle.classList.toggle('pane-hidden', !(state.showEditor && state.showPreview));
    if (state.showEditor) {
      requestAnimationFrame(() => getEditorView()?.requestMeasure());
    }
  });

  // Auto-save state
  on('state-changed', () => debouncedSave(getState()));
  on('content-changed', () => debouncedSave(getState()));

  // Focus editor
  requestAnimationFrame(() => getEditorView()?.focus());
}

function createSplitHandle(mainArea: HTMLElement): HTMLElement {
  const handle = document.createElement('div');
  handle.className = 'split-handle';

  let startX = 0;
  let startWidth = 0;

  const onMouseMove = (e: MouseEvent) => {
    const delta = e.clientX - startX;
    const newWidth = startWidth + delta;
    const totalWidth = mainArea.clientWidth;
    const pct = Math.max(15, Math.min(85, (newWidth / totalWidth) * 100));
    const editorPane = mainArea.querySelector('.editor-pane') as HTMLElement;
    const previewPane = mainArea.querySelector('.preview-pane') as HTMLElement;
    if (editorPane && previewPane) {
      editorPane.style.flex = `0 0 ${pct}%`;
      previewPane.style.flex = `1`;
    }
    requestAnimationFrame(() => getEditorView()?.requestMeasure());
  };

  const onMouseUp = () => {
    handle.classList.remove('dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    const editorPane = mainArea.querySelector('.editor-pane') as HTMLElement;
    startWidth = editorPane?.offsetWidth ?? 0;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // Touch support
  handle.addEventListener('touchstart', (e) => {
    const touch = (e as TouchEvent).touches[0];
    startX = touch.clientX;
    const editorPane = mainArea.querySelector('.editor-pane') as HTMLElement;
    startWidth = editorPane?.offsetWidth ?? 0;
    handle.classList.add('dragging');

    const onTouchMove = (ev: Event) => {
      const t = (ev as TouchEvent).touches[0];
      const delta = t.clientX - startX;
      const newWidth = startWidth + delta;
      const totalWidth = mainArea.clientWidth;
      const pct = Math.max(15, Math.min(85, (newWidth / totalWidth) * 100));
      const ep = mainArea.querySelector('.editor-pane') as HTMLElement;
      const pp = mainArea.querySelector('.preview-pane') as HTMLElement;
      if (ep && pp) { ep.style.flex = `0 0 ${pct}%`; pp.style.flex = '1'; }
    };

    const onTouchEnd = () => {
      handle.classList.remove('dragging');
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
  }, { passive: true });

  return handle;
}

function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === 'b') {
      e.preventDefault();
      emit('toolbar-action', 'bold');
    } else if (ctrl && e.key === 'i') {
      e.preventDefault();
      emit('toolbar-action', 'italic');
    } else if (ctrl && e.key === 'k') {
      e.preventDefault();
      emit('toolbar-action', 'link');
    } else if (ctrl && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      emit('beautify');
    } else if (ctrl && e.key === 's') {
      e.preventDefault();
      debouncedSaveNow();
    } else if (ctrl && e.key === 'n') {
      e.preventDefault();
      addTab();
    }
  });
}

function debouncedSaveNow(): void {
  debouncedSave(getState(), 0);
}
