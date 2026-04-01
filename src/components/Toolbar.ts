import { icon } from './icons';
import { themes, applyTheme } from '../themes/themes';
import { getState, setTheme, addTab, toggleSyncScroll, togglePreview, toggleEditor } from '../lib/state';
import { emit, on } from '../lib/events';

export function createToolbar(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'toolbar';

  el.innerHTML = `
    <div class="toolbar-brand">
      <span class="icon" style="color:var(--accent)">${icon('logo')}</span>
      <span class="brand-text">MarkdownViz</span>
    </div>

    <div class="toolbar-group">
      <button class="toolbar-btn" data-action="bold" title="Bold (Ctrl+B)">${icon('bold')}</button>
      <button class="toolbar-btn" data-action="italic" title="Italic (Ctrl+I)">${icon('italic')}</button>
      <button class="toolbar-btn" data-action="heading" title="Heading">${icon('heading')}</button>
      <button class="toolbar-btn" data-action="code" title="Code">${icon('code')}</button>
      <button class="toolbar-btn" data-action="link" title="Link (Ctrl+K)">${icon('link')}</button>
      <button class="toolbar-btn" data-action="image" title="Image">${icon('image')}</button>
    </div>

    <span class="toolbar-separator"></span>

    <div class="toolbar-group">
      <button class="toolbar-btn" data-action="list" title="Bullet list">${icon('list')}</button>
      <button class="toolbar-btn" data-action="checklist" title="Task list">${icon('checklist')}</button>
      <button class="toolbar-btn" data-action="table" title="Table">${icon('table')}</button>
      <button class="toolbar-btn" data-action="quote" title="Blockquote">${icon('quote')}</button>
      <button class="toolbar-btn" data-action="hr" title="Horizontal rule">${icon('hr')}</button>
    </div>

    <span class="toolbar-separator"></span>

    <div class="toolbar-group">
      <button class="toolbar-btn" data-action="beautify" title="Beautify (Ctrl+Shift+F)">${icon('wand')}<span class="btn-label">Beautify</span></button>
    </div>

    <span class="toolbar-spacer"></span>

    <div class="toolbar-group">
      <button class="toolbar-btn" data-action="import" title="Import file">${icon('upload')}<span class="btn-label">Import</span></button>
      <div class="dropdown">
        <button class="toolbar-btn" data-action="export-toggle" title="Export">${icon('download')}<span class="btn-label">Export</span></button>
        <div class="dropdown-menu" id="export-menu">
          <button class="dropdown-item" data-export="md">📄 Markdown (.md)</button>
          <button class="dropdown-item" data-export="html">🌐 HTML (.html)</button>
          <button class="dropdown-item" data-export="pdf">📑 PDF (.pdf)</button>
        </div>
      </div>
    </div>

    <span class="toolbar-separator"></span>

    <div class="toolbar-group">
      <button class="toolbar-btn" data-action="toggle-editor" title="Toggle editor">${icon('edit')}</button>
      <button class="toolbar-btn" data-action="toggle-preview" title="Toggle preview">${icon('eye')}</button>
      <button class="toolbar-btn active" data-action="toggle-split" title="Split view">${icon('columns')}</button>
      <button class="toolbar-btn active" data-action="toggle-sync" title="Sync scroll">${icon('sync')}</button>
    </div>

    <span class="toolbar-separator"></span>

    <div class="toolbar-group">
      <div class="dropdown">
        <button class="toolbar-btn" data-action="theme-toggle" title="Theme">${icon('palette')}</button>
        <div class="dropdown-menu" id="theme-menu"></div>
      </div>
    </div>

    <div class="toolbar-group" id="auth-area"></div>
  `;

  setupToolbarEvents(el);
  buildThemeMenu(el);

  on('sync-scroll-changed', (val: unknown) => {
    const btn = el.querySelector('[data-action="toggle-sync"]');
    btn?.classList.toggle('active', val as boolean);
  });

  on('layout-changed', () => updateLayoutButtons(el));

  return el;
}

function buildThemeMenu(toolbar: HTMLElement): void {
  const menu = toolbar.querySelector('#theme-menu')!;
  const currentTheme = getState().theme;

  const lightThemes = themes.filter(t => t.type === 'light');
  const darkThemes = themes.filter(t => t.type === 'dark');

  let html = '<div class="dropdown-label">Light</div>';
  for (const t of lightThemes) {
    html += `<button class="dropdown-item ${t.id === currentTheme ? 'active' : ''}" data-theme="${t.id}">
      <span class="theme-swatch" style="background:${t.colors['--bg-primary']};"></span>
      ${t.name}
    </button>`;
  }
  html += '<div class="dropdown-label">Dark</div>';
  for (const t of darkThemes) {
    html += `<button class="dropdown-item ${t.id === currentTheme ? 'active' : ''}" data-theme="${t.id}">
      <span class="theme-swatch" style="background:${t.colors['--bg-primary']};"></span>
      ${t.name}
    </button>`;
  }
  menu.innerHTML = html;

  on('theme-changed', () => {
    const current = getState().theme;
    menu.querySelectorAll('.dropdown-item').forEach(item => {
      item.classList.toggle('active', (item as HTMLElement).dataset.theme === current);
    });
  });
}

function updateLayoutButtons(toolbar: HTMLElement): void {
  const state = getState();
  toolbar.querySelector('[data-action="toggle-editor"]')?.classList.toggle('active', state.showEditor);
  toolbar.querySelector('[data-action="toggle-preview"]')?.classList.toggle('active', state.showPreview);
  const split = state.showEditor && state.showPreview;
  toolbar.querySelector('[data-action="toggle-split"]')?.classList.toggle('active', split);
}

function setupToolbarEvents(toolbar: HTMLElement): void {
  toolbar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!btn) {
      // Theme/export item clicks
      const themeItem = (e.target as HTMLElement).closest('[data-theme]') as HTMLElement | null;
      if (themeItem) {
        const id = themeItem.dataset.theme!;
        setTheme(id);
        applyTheme(id);
        closeAllDropdowns(toolbar);
        return;
      }
      const exportItem = (e.target as HTMLElement).closest('[data-export]') as HTMLElement | null;
      if (exportItem) {
        emit('export', exportItem.dataset.export);
        closeAllDropdowns(toolbar);
        return;
      }
      closeAllDropdowns(toolbar);
      return;
    }

    const action = btn.dataset.action!;
    switch (action) {
      case 'theme-toggle':
        toggleDropdown(toolbar.querySelector('#theme-menu')!);
        break;
      case 'export-toggle':
        toggleDropdown(toolbar.querySelector('#export-menu')!);
        break;
      case 'toggle-sync':
        toggleSyncScroll();
        break;
      case 'toggle-preview':
        togglePreview();
        break;
      case 'toggle-editor':
        toggleEditor();
        break;
      case 'toggle-split': {
        const s = getState();
        if (!s.showEditor || !s.showPreview) {
          if (!s.showEditor) toggleEditor();
          if (!s.showPreview) togglePreview();
        }
        break;
      }
      case 'import':
        emit('import-file');
        break;
      default:
        emit('toolbar-action', action);
        break;
    }
  });

  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.dropdown')) {
      closeAllDropdowns(toolbar);
    }
  });
}

function toggleDropdown(menu: Element): void {
  const isOpen = menu.classList.contains('open');
  menu.closest('.toolbar')?.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
  if (!isOpen) menu.classList.add('open');
}

function closeAllDropdowns(toolbar: HTMLElement): void {
  toolbar.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
}
