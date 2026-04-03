import { icon } from './icons';
import { on } from '../lib/events';
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
import { getState, restoreState } from '../lib/state';
import type { UserProfile } from '../types';

let panelOverlay: HTMLElement | null = null;
let currentProfile: UserProfile | null = null;

export function initAuthUI(): void {
  const authArea = document.getElementById('auth-area');
  if (!authArea) return;

  if (!isFirebaseReady()) {
    authArea.innerHTML = `<span style="font-size:11px;color:var(--text-muted);padding:0 4px" title="Add Firebase config for cloud sync">Local</span>`;
    return;
  }

  renderAuthButton(authArea, null);

  on('auth-changed', (profile: unknown) => {
    currentProfile = profile as UserProfile | null;
    renderAuthButton(authArea, currentProfile);
    if (currentProfile) {
      // Auto-load from cloud on sign-in
      loadFromCloud().then((cloudState) => {
        if (cloudState?.tabs?.length) restoreState(cloudState);
      });
    }
    // Refresh panel if open
    if (panelOverlay) {
      const content = document.getElementById('auth-panel-content');
      if (content) renderPanelContent(content);
    }
  });
}

function renderAuthButton(container: HTMLElement, profile: UserProfile | null): void {
  container.innerHTML = '';

  const btn = document.createElement('button');
  btn.className = 'toolbar-btn auth-trigger-btn';

  if (profile) {
    if (profile.photoURL) {
      btn.innerHTML = `<img class="user-avatar" src="${escapeHtml(profile.photoURL)}" alt="" /><span class="btn-label">${escapeHtml(profile.displayName || 'User')}</span>`;
    } else {
      const initial = (profile.displayName || profile.email || 'U').charAt(0).toUpperCase();
      btn.innerHTML = `<span class="user-avatar-initial">${initial}</span><span class="btn-label">${escapeHtml(profile.displayName || 'User')}</span>`;
    }
    btn.title = profile.email || profile.displayName || 'Account';
  } else {
    btn.innerHTML = `${icon('user')}<span class="btn-label">Sign in</span>`;
    btn.title = 'Sign in for cloud sync';
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panelOverlay) {
      closeAuthPanel();
    } else {
      openAuthPanel();
    }
  });

  container.appendChild(btn);
}

function openAuthPanel(): void {
  if (panelOverlay) return;

  panelOverlay = document.createElement('div');
  panelOverlay.className = 'auth-panel-overlay';
  panelOverlay.addEventListener('click', (e) => {
    if (e.target === panelOverlay) closeAuthPanel();
  });

  const panel = document.createElement('div');
  panel.className = 'auth-panel';

  const header = document.createElement('div');
  header.className = 'auth-panel-header';
  header.innerHTML = `
    <span class="auth-panel-title">${currentProfile ? '👤 Your Account' : '🔐 Sign In'}</span>
    <button class="settings-close" title="Close">×</button>
  `;
  header.querySelector('.settings-close')!.addEventListener('click', closeAuthPanel);

  const content = document.createElement('div');
  content.className = 'auth-panel-content';
  content.id = 'auth-panel-content';

  panel.append(header, content);
  panelOverlay.appendChild(panel);
  document.body.appendChild(panelOverlay);

  renderPanelContent(content);
}

function closeAuthPanel(): void {
  panelOverlay?.remove();
  panelOverlay = null;
}

function renderPanelContent(content: HTMLElement): void {
  content.innerHTML = '';

  if (!currentProfile) {
    renderSignInContent(content);
    return;
  }

  // ─── Profile Card ───
  const card = document.createElement('div');
  card.className = 'profile-card';
  const initial = (currentProfile.displayName || currentProfile.email || 'U').charAt(0).toUpperCase();
  card.innerHTML = `
    ${currentProfile.photoURL
      ? `<img class="profile-avatar" src="${escapeHtml(currentProfile.photoURL)}" alt="" />`
      : `<div class="profile-avatar-placeholder">${initial}</div>`}
    <div class="profile-details">
      <div class="profile-name">${escapeHtml(currentProfile.displayName || 'User')}</div>
      <div class="profile-email">${escapeHtml(currentProfile.email || '')}</div>
      <div class="profile-provider">${icon(currentProfile.provider === 'github' ? 'github' : 'google')} via ${currentProfile.provider === 'github' ? 'GitHub' : 'Google'}</div>
    </div>
  `;
  content.appendChild(card);

  // ─── Beta Banner ───
  const banner = document.createElement('div');
  banner.className = 'space-banner';
  banner.innerHTML = `<span class="badge">FREE TIER</span> Up to <strong>5 documents</strong> synced to cloud.`;
  content.appendChild(banner);

  // ─── Sync Actions ───
  const actionsRow = document.createElement('div');
  actionsRow.className = 'auth-actions-row';

  const syncBtn = createActionBtn('☁️ Sync to Cloud', 'accent', async () => {
    syncBtn.textContent = '⏳ Syncing...';
    syncBtn.disabled = true;
    const ok = await syncToCloud(getState());
    syncBtn.textContent = ok ? '✅ Synced!' : '❌ Failed';
    syncBtn.disabled = false;
    setTimeout(() => {
      syncBtn.textContent = '☁️ Sync to Cloud';
      loadCloudDocs(docsContainer);
    }, 1500);
  });

  const loadBtn = createActionBtn('📥 Load from Cloud', 'default', async () => {
    loadBtn.textContent = '⏳ Loading...';
    loadBtn.disabled = true;
    const c = await loadFromCloud();
    if (c?.tabs?.length) {
      restoreState(c);
      closeAuthPanel();
    } else {
      loadBtn.textContent = '📭 Nothing found';
      setTimeout(() => { loadBtn.textContent = '📥 Load from Cloud'; loadBtn.disabled = false; }, 1500);
    }
  });

  actionsRow.append(syncBtn, loadBtn);
  content.appendChild(actionsRow);

  // ─── Cloud Docs ───
  const docsSection = document.createElement('div');
  docsSection.className = 'space-section';

  const docsTitle = document.createElement('div');
  docsTitle.className = 'space-section-title';
  docsTitle.textContent = 'Cloud Documents';

  const docsContainer = document.createElement('div');
  docsContainer.id = 'cloud-docs-list';
  docsContainer.innerHTML = '<div class="space-empty">Loading…</div>';

  docsSection.append(docsTitle, docsContainer);
  content.appendChild(docsSection);

  loadCloudDocs(docsContainer);

  // ─── Sign Out ───
  const signOutBtn = document.createElement('button');
  signOutBtn.className = 'signout-btn';
  signOutBtn.textContent = '🚪 Sign Out';
  signOutBtn.addEventListener('click', async () => {
    await signOut();
    closeAuthPanel();
  });
  content.appendChild(signOutBtn);
}

function renderSignInContent(content: HTMLElement): void {
  const desc = document.createElement('p');
  desc.className = 'signin-description';
  desc.innerHTML = 'Sign in to sync documents across your devices. Your work is always saved locally — signing in is <strong>optional</strong>.';
  content.appendChild(desc);

  const ghBtn = document.createElement('button');
  ghBtn.className = 'signin-btn';
  ghBtn.innerHTML = `${icon('github')} Continue with GitHub`;
  ghBtn.addEventListener('click', async () => {
    ghBtn.innerHTML = `${icon('github')} Signing in…`;
    ghBtn.disabled = true;
    try { await signInWithGitHub(); }
    catch { ghBtn.innerHTML = `${icon('github')} Continue with GitHub`; ghBtn.disabled = false; }
  });
  content.appendChild(ghBtn);

  const ggBtn = document.createElement('button');
  ggBtn.className = 'signin-btn';
  ggBtn.innerHTML = `${icon('google')} Continue with Google`;
  ggBtn.addEventListener('click', async () => {
    ggBtn.innerHTML = `${icon('google')} Signing in…`;
    ggBtn.disabled = true;
    try { await signInWithGoogle(); }
    catch { ggBtn.innerHTML = `${icon('google')} Continue with Google`; ggBtn.disabled = false; }
  });
  content.appendChild(ggBtn);
}

async function loadCloudDocs(container: HTMLElement): Promise<void> {
  try {
    const files = await getCloudFiles();
    if (!files.length) {
      container.innerHTML = '<div class="space-empty">No documents synced yet.</div>';
      return;
    }

    const sorted = [...files].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const list = document.createElement('ul');
    list.className = 'space-doc-list';

    for (const file of sorted) {
      const li = document.createElement('li');
      li.className = 'space-doc-item';

      const name = document.createElement('span');
      name.className = 'space-doc-name';
      name.textContent = file.name;
      name.title = file.name;

      const date = document.createElement('span');
      date.className = 'space-doc-date';
      date.textContent = file.updatedAt ? formatRelDate(file.updatedAt) : '';

      const del = document.createElement('button');
      del.className = 'space-doc-remove';
      del.textContent = '×';
      del.title = 'Remove from cloud';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        del.textContent = '…';
        await deleteCloudFile(file.id);
        li.remove();
        if (!list.querySelector('.space-doc-item')) {
          container.innerHTML = '<div class="space-empty">No documents synced yet.</div>';
        }
      });

      li.append(name, date, del);
      list.appendChild(li);
    }

    container.innerHTML = '';
    container.appendChild(list);
  } catch {
    container.innerHTML = '<div class="space-empty">Could not load cloud documents.</div>';
  }
}

function createActionBtn(label: string, variant: 'accent' | 'default', onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `auth-action-btn ${variant === 'accent' ? 'auth-action-btn--primary' : ''}`;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function formatRelDate(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
