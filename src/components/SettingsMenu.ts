import { icon } from './icons';
import { themes, applyTheme } from '../themes/themes';
import { getState, setTheme, toggleSyncScroll, togglePreview, toggleEditor } from '../lib/state';
import { emit, on } from '../lib/events';
import {
  signInWithGitHub,
  signInWithGoogle,
  signOut,
  isFirebaseReady,
  syncToCloud,
  loadFromCloud,
} from '../lib/auth';
import { restoreState } from '../lib/state';
import type { UserProfile } from '../types';

let overlayEl: HTMLElement | null = null;
let panelEl: HTMLElement | null = null;
let authProfile: UserProfile | null = null;

export function initSettingsMenu(): void {
  on('auth-changed', (profile: unknown) => {
    authProfile = profile as UserProfile | null;
    if (panelEl) renderPanelContent();
  });
}

export function openSettingsMenu(): void {
  if (overlayEl) return;

  overlayEl = document.createElement('div');
  overlayEl.className = 'settings-overlay';
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) closeSettingsMenu();
  });

  panelEl = document.createElement('div');
  panelEl.className = 'settings-panel';

  const header = document.createElement('div');
  header.className = 'settings-header';
  header.innerHTML = `
    <span class="settings-title">⚙️ Settings</span>
    <button class="settings-close" title="Close">×</button>
  `;
  header.querySelector('.settings-close')!.addEventListener('click', closeSettingsMenu);

  panelEl.appendChild(header);

  const content = document.createElement('div');
  content.className = 'settings-content';
  content.id = 'settings-content';
  panelEl.appendChild(content);

  overlayEl.appendChild(panelEl);
  document.body.appendChild(overlayEl);

  renderPanelContent();
}

function renderPanelContent(): void {
  const content = document.getElementById('settings-content');
  if (!content) return;

  const state = getState();
  const currentTheme = state.theme;

  content.innerHTML = '';

  // ─── Formatting Section ───
  const fmtSection = createSection('Formatting');
  const fmtGrid = document.createElement('div');
  fmtGrid.className = 'settings-btn-grid';
  const fmtActions = [
    { action: 'bold', label: 'Bold', ico: 'bold' },
    { action: 'italic', label: 'Italic', ico: 'italic' },
    { action: 'heading', label: 'Heading', ico: 'heading' },
    { action: 'code', label: 'Code', ico: 'code' },
    { action: 'link', label: 'Link', ico: 'link' },
    { action: 'image', label: 'Image', ico: 'image' },
    { action: 'list', label: 'List', ico: 'list' },
    { action: 'checklist', label: 'Tasks', ico: 'checklist' },
    { action: 'table', label: 'Table', ico: 'table' },
    { action: 'quote', label: 'Quote', ico: 'quote' },
    { action: 'hr', label: 'Line', ico: 'hr' },
  ];
  for (const f of fmtActions) {
    const btn = document.createElement('button');
    btn.className = 'settings-action-btn';
    btn.innerHTML = `${icon(f.ico)}<span>${f.label}</span>`;
    btn.addEventListener('click', () => {
      emit('toolbar-action', f.action);
      closeSettingsMenu();
    });
    fmtGrid.appendChild(btn);
  }
  fmtSection.appendChild(fmtGrid);
  content.appendChild(fmtSection);

  // ─── File Section ───
  const fileSection = createSection('File');
  const fileGrid = document.createElement('div');
  fileGrid.className = 'settings-btn-grid';
  const fileActions = [
    { label: 'Import', ico: 'upload', fn: () => { emit('import-file'); closeSettingsMenu(); } },
    { label: 'Export MD', ico: 'download', fn: () => { emit('export', 'md'); closeSettingsMenu(); } },
    { label: 'Export HTML', ico: 'download', fn: () => { emit('export', 'html'); closeSettingsMenu(); } },
    { label: 'Export PDF', ico: 'download', fn: () => { emit('export', 'pdf'); closeSettingsMenu(); } },
    { label: 'Beautify', ico: 'wand', fn: () => { emit('beautify'); closeSettingsMenu(); } },
  ];
  for (const f of fileActions) {
    const btn = document.createElement('button');
    btn.className = 'settings-action-btn';
    btn.innerHTML = `${icon(f.ico)}<span>${f.label}</span>`;
    btn.addEventListener('click', f.fn);
    fileGrid.appendChild(btn);
  }
  fileSection.appendChild(fileGrid);
  content.appendChild(fileSection);

  // ─── Layout Section ───
  const layoutSection = createSection('Layout');
  const layoutGrid = document.createElement('div');
  layoutGrid.className = 'settings-btn-grid';
  const layoutActions = [
    { label: 'Editor', ico: 'edit', active: state.showEditor, fn: () => { toggleEditor(); renderPanelContent(); } },
    { label: 'Preview', ico: 'eye', active: state.showPreview, fn: () => { togglePreview(); renderPanelContent(); } },
    { label: 'Sync Scroll', ico: 'sync', active: state.syncScroll, fn: () => { toggleSyncScroll(); renderPanelContent(); } },
  ];
  for (const f of layoutActions) {
    const btn = document.createElement('button');
    btn.className = `settings-action-btn ${f.active ? 'active' : ''}`;
    btn.innerHTML = `${icon(f.ico)}<span>${f.label}</span>`;
    btn.addEventListener('click', f.fn);
    layoutGrid.appendChild(btn);
  }
  layoutSection.appendChild(layoutGrid);
  content.appendChild(layoutSection);

  // ─── Theme Section ───
  const themeSection = createSection('Theme');
  const lightLabel = document.createElement('div');
  lightLabel.className = 'settings-sublabel';
  lightLabel.textContent = 'Light';
  themeSection.appendChild(lightLabel);

  const lightGrid = document.createElement('div');
  lightGrid.className = 'settings-theme-grid';
  for (const t of themes.filter(t => t.type === 'light')) {
    const btn = document.createElement('button');
    btn.className = `settings-theme-btn ${t.id === currentTheme ? 'active' : ''}`;
    btn.innerHTML = `<span class="theme-dot" style="background:${t.colors['--bg-primary']};border:2px solid ${t.colors['--accent']}"></span>${t.name}`;
    btn.addEventListener('click', () => {
      setTheme(t.id);
      applyTheme(t.id);
      renderPanelContent();
    });
    lightGrid.appendChild(btn);
  }
  themeSection.appendChild(lightGrid);

  const darkLabel = document.createElement('div');
  darkLabel.className = 'settings-sublabel';
  darkLabel.textContent = 'Dark';
  themeSection.appendChild(darkLabel);

  const darkGrid = document.createElement('div');
  darkGrid.className = 'settings-theme-grid';
  for (const t of themes.filter(t => t.type === 'dark')) {
    const btn = document.createElement('button');
    btn.className = `settings-theme-btn ${t.id === currentTheme ? 'active' : ''}`;
    btn.innerHTML = `<span class="theme-dot" style="background:${t.colors['--bg-primary']};border:2px solid ${t.colors['--accent']}"></span>${t.name}`;
    btn.addEventListener('click', () => {
      setTheme(t.id);
      applyTheme(t.id);
      renderPanelContent();
    });
    darkGrid.appendChild(btn);
  }
  themeSection.appendChild(darkGrid);
  content.appendChild(themeSection);

  // ─── Account Section ───
  if (isFirebaseReady()) {
    const authSection = createSection('Account');
    if (authProfile) {
      const info = document.createElement('div');
      info.className = 'settings-auth-info';
      info.innerHTML = `
        ${authProfile.photoURL ? `<img class="settings-avatar" src="${authProfile.photoURL}" alt="" />` : ''}
        <div>
          <div class="settings-auth-name">${escapeHtml(authProfile.displayName || 'User')}</div>
          <div class="settings-auth-email">${escapeHtml(authProfile.email || '')}</div>
        </div>
      `;
      authSection.appendChild(info);

      const authGrid = document.createElement('div');
      authGrid.className = 'settings-btn-grid';
      const authActions = [
        { label: '☁️ Sync to Cloud', fn: async () => { await syncToCloud(getState()); closeSettingsMenu(); } },
        { label: '📥 Load from Cloud', fn: async () => { const c = await loadFromCloud(); if (c?.tabs?.length) restoreState(c); closeSettingsMenu(); } },
        { label: '🚪 Sign Out', fn: async () => { await signOut(); renderPanelContent(); } },
      ];
      for (const a of authActions) {
        const btn = document.createElement('button');
        btn.className = 'settings-action-btn wide';
        btn.textContent = a.label;
        btn.addEventListener('click', a.fn);
        authGrid.appendChild(btn);
      }
      authSection.appendChild(authGrid);
    } else {
      const authGrid = document.createElement('div');
      authGrid.className = 'settings-btn-grid';
      const signInBtn = (label: string, icn: string, fn: () => Promise<void>) => {
        const btn = document.createElement('button');
        btn.className = 'settings-action-btn wide';
        btn.innerHTML = `${icon(icn)} ${label}`;
        btn.addEventListener('click', async () => {
          try { await fn(); } catch (err) { console.error('Sign-in error:', err); }
        });
        return btn;
      };
      authGrid.appendChild(signInBtn('Sign in with GitHub', 'github', signInWithGitHub));
      authGrid.appendChild(signInBtn('Sign in with Google', 'google', signInWithGoogle));
      authSection.appendChild(authGrid);
    }
    content.appendChild(authSection);
  }
}

function createSection(title: string): HTMLElement {
  const section = document.createElement('div');
  section.className = 'settings-section';
  const label = document.createElement('div');
  label.className = 'settings-section-label';
  label.textContent = title;
  section.appendChild(label);
  return section;
}

export function closeSettingsMenu(): void {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
    panelEl = null;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
