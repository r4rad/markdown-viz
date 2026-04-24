import { icon } from './icons';
import { themes, applyTheme } from '../themes/themes';
import { getState, setTheme, addTab, toggleSyncScroll, togglePreview, toggleEditor } from '../lib/state';
import { emit, on } from '../lib/events';
import { openSettingsMenu } from './SettingsMenu';
import { isSharingEnabled } from '../lib/share';
import { setPreviewEditable, isPreviewEditable } from './Preview';

export function createToolbar(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'toolbar';

  el.innerHTML = `
    <div class="toolbar-brand">
      <span class="icon" style="color:var(--accent)">${icon('logo')}</span>
      <span class="brand-text">MarkdownViz</span>
    </div>

    <div class="toolbar-group desktop-only">
      <button class="toolbar-btn" data-action="bold" title="Bold (Ctrl+B)">${icon('bold')}</button>
      <button class="toolbar-btn" data-action="italic" title="Italic (Ctrl+I)">${icon('italic')}</button>
      <button class="toolbar-btn" data-action="heading" title="Heading">${icon('heading')}</button>
      <button class="toolbar-btn" data-action="code" title="Code">${icon('code')}</button>
      <button class="toolbar-btn" data-action="link" title="Link (Ctrl+K)">${icon('link')}</button>
      <button class="toolbar-btn" data-action="image" title="Image">${icon('image')}</button>
    </div>

    <span class="toolbar-separator desktop-only"></span>

    <div class="toolbar-group desktop-only">
      <button class="toolbar-btn" data-action="list" title="Bullet list">${icon('list')}</button>
      <button class="toolbar-btn" data-action="checklist" title="Task list">${icon('checklist')}</button>
      <button class="toolbar-btn" data-action="table" title="Table">${icon('table')}</button>
      <button class="toolbar-btn" data-action="quote" title="Blockquote">${icon('quote')}</button>
      <button class="toolbar-btn" data-action="hr" title="Horizontal rule">${icon('hr')}</button>
    </div>

    <span class="toolbar-separator desktop-only"></span>

    <div class="toolbar-group desktop-only">
      <button class="toolbar-btn" data-action="beautify" title="Beautify (Ctrl+Shift+F)">${icon('wand')}<span class="btn-label">Beautify</span></button>
    </div>

    <div class="toolbar-group mobile-only mobile-toolbar-scroll">
      <button class="toolbar-btn" data-action="bold" title="Bold">
        ${icon('bold')}
      </button>
      <button class="toolbar-btn" data-action="italic" title="Italic">
        ${icon('italic')}
      </button>
      <button class="toolbar-btn" data-action="heading" title="Heading">
        ${icon('heading')}
      </button>
      <button class="toolbar-btn" data-action="code" title="Code">
        ${icon('code')}
      </button>
      <button class="toolbar-btn" data-action="link" title="Link">
        ${icon('link')}
      </button>
      <button class="toolbar-btn" data-action="image" title="Image">
        ${icon('image')}
      </button>
      <button class="toolbar-btn" data-action="list" title="List">
        ${icon('list')}
      </button>
      <button class="toolbar-btn" data-action="checklist" title="Task list">
        ${icon('checklist')}
      </button>
      <button class="toolbar-btn" data-action="table" title="Table">
        ${icon('table')}
      </button>
      <button class="toolbar-btn" data-action="quote" title="Quote">
        ${icon('quote')}
      </button>
      <button class="toolbar-btn" data-action="hr" title="Divider">
        ${icon('hr')}
      </button>
      <span class="toolbar-separator" style="height:20px"></span>
      <button class="toolbar-btn" data-action="beautify" title="Beautify">
        ${icon('wand')}
      </button>
      <button class="toolbar-btn" data-action="import" title="Import">
        ${icon('upload')}
      </button>
      <button class="toolbar-btn" data-action="export-md" title="Export MD">
        ${icon('download')}
      </button>
      <span class="toolbar-separator" style="height:20px"></span>
      <button class="toolbar-btn active" data-action="show-editor" title="Editor only">
        ${icon('edit')}
      </button>
      <button class="toolbar-btn" data-action="show-preview" title="Preview only">
        ${icon('eye')}
      </button>
      <button class="toolbar-btn active" data-action="show-split" title="Split view">
        ${icon('columns')}
      </button>
      <button class="toolbar-btn active" data-action="toggle-sync" title="Sync scroll">
        ${icon('scroll-link')}
      </button>
    </div>

    <span class="toolbar-spacer"></span>

    <div class="toolbar-group desktop-only">
      <button class="toolbar-btn" data-action="import" title="Import file">${icon('upload')}<span class="btn-label">Import</span></button>
      <div class="dropdown">
        <button class="toolbar-btn" data-action="export-toggle" title="Export">${icon('download')}<span class="btn-label">Export</span></button>
        <div class="dropdown-menu" id="export-menu">
          <button class="dropdown-item" data-export="md">📄 Markdown (.md)</button>
          <button class="dropdown-item" data-export="html">🌐 HTML (.html)</button>
          <button class="dropdown-item" data-export="pdf">📑 PDF (.pdf)</button>
          <button class="dropdown-item" data-export="docx">📝 Word (.docx)</button>
        </div>
      </div>
    </div>

    <span class="toolbar-separator desktop-only"></span>

    <div class="toolbar-group toolbar-layout-group desktop-only">
      <button class="toolbar-btn active" data-action="show-editor" title="Editor only">${icon('edit')}</button>
      <button class="toolbar-btn" data-action="show-preview" title="Preview only">${icon('eye')}</button>
      <button class="toolbar-btn active" data-action="show-split" title="Split view">${icon('columns')}</button>
      <span class="toolbar-separator" style="height:20px;margin:0 2px"></span>
      <button class="toolbar-btn" data-action="toggle-preview-edit" title="Edit in preview" id="preview-edit-btn">${icon('doc-edit')}</button>
      <button class="toolbar-btn active" data-action="toggle-sync" title="Sync scroll">${icon('scroll-link')}</button>
    </div>

    <span class="toolbar-separator desktop-only"></span>

    <div class="toolbar-group desktop-only">
      <button class="toolbar-btn" data-action="copy-editor" title="Copy markdown">${icon('copy')}</button>
    </div>

    <span class="toolbar-separator desktop-only"></span>

    <div class="toolbar-group desktop-only">
      <div class="dropdown">
        <button class="toolbar-btn" data-action="theme-toggle" title="Theme">${icon('palette')}</button>
        <div class="dropdown-menu" id="theme-menu"></div>
      </div>
    </div>

    <div class="toolbar-group">
      <button class="toolbar-btn" id="play-audio-btn" data-action="play-audio" title="Read document aloud">
        ${icon('play')}<span class="btn-label desktop-only">Listen</span>
      </button>
    </div>

    <div class="toolbar-group">
      <button class="toolbar-btn sync-cloud-btn" data-action="cloud-sync" id="cloud-sync-btn" title="Sync to cloud (Ctrl+S)" style="display:none">
        ${icon('cloud-sync')}
      </button>
    </div>

    <div class="toolbar-group">
      <button class="toolbar-btn" data-action="share" id="share-btn" title="Share document" style="display:none">
        ${icon('share')}<span class="btn-label desktop-only">Share</span>
      </button>
    </div>

    <div class="toolbar-group" id="auth-area"></div>

    <div class="toolbar-group" id="collab-indicator" style="display:none">
      ${icon('users')}<span class="collab-badge" id="collab-badge" title="Collaboration active"></span>
    </div>

    <div class="toolbar-group">
      <button class="toolbar-btn settings-btn" data-action="open-settings" title="Settings">${icon('gear')}</button>
    </div>
  `;

  setupToolbarEvents(el);
  buildThemeMenu(el);
  updateLayoutButtons(el);

  on('sync-scroll-changed', (val: unknown) => {
    el.querySelectorAll('[data-action="toggle-sync"]').forEach(b => b.classList.toggle('active', val as boolean));
  });

  on('layout-changed', () => updateLayoutButtons(el));

  on('preview-mode-changed', (editable: unknown) => {
    el.querySelectorAll('[data-action="toggle-preview-edit"]').forEach(b => b.classList.toggle('active', editable as boolean));
  });

  // Show/hide cloud-sync and share buttons based on auth state
  on('auth-changed', (profile: unknown) => {
    const syncBtn = el.querySelector('#cloud-sync-btn') as HTMLElement | null;
    if (syncBtn) syncBtn.style.display = profile ? '' : 'none';
    const shareBtn = el.querySelector('#share-btn') as HTMLElement | null;
    if (shareBtn) shareBtn.style.display = (profile && isSharingEnabled()) ? '' : 'none';
  });

  on('collab-changed', (active: unknown) => {
    const indicator = el.querySelector('#collab-indicator') as HTMLElement | null;
    if (indicator) indicator.style.display = active ? '' : 'none';
  });

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
  const editorOnly = state.showEditor && !state.showPreview;
  const previewOnly = !state.showEditor && state.showPreview;
  const split = state.showEditor && state.showPreview;
  toolbar.querySelectorAll('[data-action="show-editor"]').forEach(b => b.classList.toggle('active', editorOnly));
  toolbar.querySelectorAll('[data-action="show-preview"]').forEach(b => b.classList.toggle('active', previewOnly));
  toolbar.querySelectorAll('[data-action="show-split"]').forEach(b => b.classList.toggle('active', split));
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
      case 'export-md':
        emit('export', 'md');
        break;
      case 'toggle-sync':
        toggleSyncScroll();
        break;
      case 'show-preview': {
        // Show preview only
        const s1 = getState();
        if (s1.showEditor) toggleEditor();
        if (!s1.showPreview) togglePreview();
        break;
      }
      case 'show-editor': {
        // Show editor only
        const s2 = getState();
        if (!s2.showEditor) toggleEditor();
        if (s2.showPreview) togglePreview();
        break;
      }
      case 'show-split': {
        // Show both
        const s3 = getState();
        if (!s3.showEditor) toggleEditor();
        if (!s3.showPreview) togglePreview();
        break;
      }
      case 'toggle-preview-edit':
        setPreviewEditable(!isPreviewEditable());
        break;
      case 'copy-editor':
        emit('copy-editor');
        break;
      case 'play-audio':
        emit('play-audio-request');
        break;
      case 'cloud-sync':
        emit('cloud-sync-request');
        break;
      case 'share':
        emit('share-request');
        break;
      case 'import':
        emit('import-file');
        break;
      case 'open-settings':
        openSettingsMenu();
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
