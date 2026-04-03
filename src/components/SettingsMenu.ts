import { icon } from './icons';
import { themes, applyTheme } from '../themes/themes';
import { getState, setTheme, toggleSyncScroll, togglePreview, toggleEditor, updateTabName, getActiveTab } from '../lib/state';
import { emit, on } from '../lib/events';
import {
  signInWithGitHub,
  signInWithGoogle,
  signOut,
  isFirebaseReady,
  syncToCloud,
  loadFromCloud,
  deleteCloudFile,
  getCloudFiles,
} from '../lib/auth';
import { restoreState } from '../lib/state';
import { openFeedbackModal } from './FeedbackModal';
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

  // ─── Account / Profile Section ───
  if (isFirebaseReady()) {
    const authSection = createSection('Account');
    if (authProfile) {
      // Profile card
      const card = document.createElement('div');
      card.className = 'profile-card';
      const initial = (authProfile.displayName || authProfile.email || 'U').charAt(0).toUpperCase();
      card.innerHTML = `
        ${authProfile.photoURL
          ? `<img class="profile-avatar" src="${escapeHtml(authProfile.photoURL)}" alt="" />`
          : `<div class="profile-avatar-placeholder">${initial}</div>`}
        <div class="profile-details">
          <div class="profile-name">${escapeHtml(authProfile.displayName || 'User')}</div>
          <div class="profile-email">${escapeHtml(authProfile.email || '')}</div>
          <div class="profile-provider">${icon(authProfile.provider === 'github' ? 'github' : 'google')} ${authProfile.provider === 'github' ? 'GitHub' : 'Google'}</div>
        </div>
      `;
      authSection.appendChild(card);

      // Sync / Sign Out actions
      const authGrid = document.createElement('div');
      authGrid.className = 'settings-btn-grid';
      const syncBtn = document.createElement('button');
      syncBtn.className = 'settings-action-btn wide';
      syncBtn.textContent = '☁️ Sync to Cloud';
      syncBtn.addEventListener('click', async () => {
        syncBtn.textContent = '☁️ Syncing...';
        syncBtn.disabled = true;
        await syncToCloud(getState());
        syncBtn.textContent = '✅ Synced!';
        setTimeout(() => renderPanelContent(), 1000);
      });
      authGrid.appendChild(syncBtn);

      const loadBtn = document.createElement('button');
      loadBtn.className = 'settings-action-btn wide';
      loadBtn.textContent = '📥 Load from Cloud';
      loadBtn.addEventListener('click', async () => {
        loadBtn.textContent = '📥 Loading...';
        loadBtn.disabled = true;
        const c = await loadFromCloud();
        if (c?.tabs?.length) restoreState(c);
        closeSettingsMenu();
      });
      authGrid.appendChild(loadBtn);

      const signOutBtn = document.createElement('button');
      signOutBtn.className = 'settings-action-btn wide';
      signOutBtn.textContent = '🚪 Sign Out';
      signOutBtn.addEventListener('click', async () => {
        await signOut();
        renderPanelContent();
      });
      authGrid.appendChild(signOutBtn);
      authSection.appendChild(authGrid);

      content.appendChild(authSection);

      // ─── Your Space Section ───
      const spaceSection = createSection('Your Space');

      const banner = document.createElement('div');
      banner.className = 'space-banner';
      banner.innerHTML = `<span class="badge">BETA</span> Your current plan supports up to <strong>5 documents</strong> in the cloud.`;
      spaceSection.appendChild(banner);

      // Load and show cloud files
      const docListContainer = document.createElement('div');
      docListContainer.id = 'space-doc-list-container';
      docListContainer.innerHTML = '<div class="space-empty">Loading cloud documents...</div>';
      spaceSection.appendChild(docListContainer);

      content.appendChild(spaceSection);

      // Fetch cloud files asynchronously
      loadCloudFilesList(docListContainer);
    } else {
      // Signed out - show sign-in prompt
      const desc = document.createElement('div');
      desc.className = 'signin-description';
      desc.textContent = 'Sign in to sync your documents across devices. Your work is always saved locally — signing in is optional.';
      authSection.appendChild(desc);

      const ghBtn = document.createElement('button');
      ghBtn.className = 'signin-btn';
      ghBtn.innerHTML = `${icon('github')} Continue with GitHub`;
      ghBtn.addEventListener('click', async () => {
        ghBtn.textContent = 'Signing in...';
        ghBtn.disabled = true;
        try { await signInWithGitHub(); } catch (err) { console.error('Sign-in error:', err); renderPanelContent(); }
      });
      authSection.appendChild(ghBtn);

      const ggBtn = document.createElement('button');
      ggBtn.className = 'signin-btn';
      ggBtn.innerHTML = `${icon('google')} Continue with Google`;
      ggBtn.addEventListener('click', async () => {
        ggBtn.textContent = 'Signing in...';
        ggBtn.disabled = true;
        try { await signInWithGoogle(); } catch (err) { console.error('Sign-in error:', err); renderPanelContent(); }
      });
      authSection.appendChild(ggBtn);

      content.appendChild(authSection);
    }
  }

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

  // Rename current tab
  const activeTab = getActiveTab();
  if (activeTab) {
    const renameRow = document.createElement('div');
    renameRow.className = 'settings-rename-row';
    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = activeTab.name;
    renameInput.className = 'settings-rename-input';
    renameInput.placeholder = 'Tab name…';
    const renameBtn = document.createElement('button');
    renameBtn.className = 'settings-action-btn';
    renameBtn.innerHTML = `${icon('rename')}<span>Rename</span>`;
    renameBtn.addEventListener('click', () => {
      const val = renameInput.value.trim();
      if (val && val !== activeTab.name) {
        updateTabName(activeTab.id, val);
      }
    });
    renameInput.addEventListener('keydown', (ke) => {
      if (ke.key === 'Enter') renameBtn.click();
    });
    renameRow.append(renameInput, renameBtn);
    fileSection.appendChild(renameRow);
  }

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

  // ─── Feedback ───
  const feedbackSection = createSection('Feedback');
  const feedbackBtn = document.createElement('button');
  feedbackBtn.className = 'settings-action-btn wide';
  feedbackBtn.innerHTML = `${icon('chat')}<span>Send Feedback</span>`;
  feedbackBtn.addEventListener('click', () => {
    closeSettingsMenu();
    openFeedbackModal();
  });
  feedbackSection.appendChild(feedbackBtn);
  content.appendChild(feedbackSection);
}

async function loadCloudFilesList(container: HTMLElement): Promise<void> {
  try {
    const files = await getCloudFiles();
    if (!files || files.length === 0) {
      container.innerHTML = '<div class="space-empty">No documents synced yet. Click "Sync to Cloud" to save your work.</div>';
      return;
    }

    const sortedFiles = files.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const list = document.createElement('ul');
    list.className = 'space-doc-list';

    for (const file of sortedFiles) {
      const li = document.createElement('li');
      li.className = 'space-doc-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'space-doc-name';
      nameSpan.textContent = file.name || 'Untitled.md';
      nameSpan.title = file.name || 'Untitled.md';

      const dateSpan = document.createElement('span');
      dateSpan.className = 'space-doc-date';
      dateSpan.textContent = file.updatedAt ? formatRelativeDate(file.updatedAt) : '';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'space-doc-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove from cloud';
      removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        removeBtn.textContent = '…';
        await deleteCloudFile(file.id);
        li.remove();
        // Update count
        const remaining = list.querySelectorAll('.space-doc-item').length;
        if (remaining === 0) {
          container.innerHTML = '<div class="space-empty">No documents synced. Click "Sync to Cloud" to save your work.</div>';
        }
      });

      li.append(nameSpan, dateSpan, removeBtn);
      list.appendChild(li);
    }

    container.innerHTML = '';
    container.appendChild(list);
  } catch {
    container.innerHTML = '<div class="space-empty">Could not load cloud documents.</div>';
  }
}

function formatRelativeDate(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
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
