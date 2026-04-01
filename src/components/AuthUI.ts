import { icon } from './icons';
import { on } from '../lib/events';
import {
  signInWithGitHub,
  signInWithGoogle,
  signOut,
  isFirebaseReady,
  syncToCloud,
  loadFromCloud,
} from '../lib/auth';
import { getState, restoreState } from '../lib/state';
import type { UserProfile } from '../types';

export function initAuthUI(): void {
  const authArea = document.getElementById('auth-area');
  if (!authArea) return;

  if (!isFirebaseReady()) {
    // No Firebase config — show minimal offline indicator
    authArea.innerHTML = `<span class="status-item" style="font-size:11px;color:var(--text-muted)" title="Add Firebase config for cloud sync">Local</span>`;
    return;
  }

  renderSignedOut(authArea);

  on('auth-changed', (profile: unknown) => {
    if (profile) {
      renderSignedIn(authArea, profile as UserProfile);
      // Auto-load from cloud on sign-in
      loadFromCloud().then((cloudState) => {
        if (cloudState?.tabs?.length) {
          restoreState(cloudState);
        }
      });
    } else {
      renderSignedOut(authArea);
    }
  });
}

function renderSignedOut(container: HTMLElement): void {
  container.innerHTML = '';

  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown';

  const btn = document.createElement('button');
  btn.className = 'toolbar-btn';
  btn.title = 'Sign in';
  btn.innerHTML = `${icon('user')}<span class="btn-label">Sign in</span>`;
  btn.addEventListener('click', () => {
    menu.classList.toggle('open');
  });

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  menu.style.right = '0';
  menu.innerHTML = `
    <div class="dropdown-label">Sign in with</div>
    <button class="dropdown-item" data-signin="github">${icon('github')} GitHub</button>
    <button class="dropdown-item" data-signin="google">${icon('google')} Google</button>
  `;

  menu.addEventListener('click', async (e) => {
    const item = (e.target as HTMLElement).closest('[data-signin]') as HTMLElement | null;
    if (!item) return;
    menu.classList.remove('open');
    try {
      if (item.dataset.signin === 'github') await signInWithGitHub();
      else if (item.dataset.signin === 'google') await signInWithGoogle();
    } catch (err) {
      console.error('Sign-in error:', err);
    }
  });

  dropdown.append(btn, menu);
  container.appendChild(dropdown);

  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.dropdown')) {
      menu.classList.remove('open');
    }
  });
}

function renderSignedIn(container: HTMLElement, profile: UserProfile): void {
  container.innerHTML = '';

  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown';

  const btn = document.createElement('button');
  btn.className = 'toolbar-btn';
  btn.title = profile.displayName || profile.email || 'User';

  if (profile.photoURL) {
    btn.innerHTML = `<img class="user-avatar" src="${profile.photoURL}" alt="" /><span class="btn-label">${escapeHtml(profile.displayName || 'User')}</span>`;
  } else {
    btn.innerHTML = `${icon('user')}<span class="btn-label">${escapeHtml(profile.displayName || 'User')}</span>`;
  }

  btn.addEventListener('click', () => menu.classList.toggle('open'));

  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  menu.style.right = '0';
  menu.innerHTML = `
    <div class="dropdown-label">${escapeHtml(profile.email || '')}</div>
    <button class="dropdown-item" data-auth="sync">☁️ Sync to Cloud</button>
    <button class="dropdown-item" data-auth="load">📥 Load from Cloud</button>
    <button class="dropdown-item" data-auth="signout">🚪 Sign Out</button>
  `;

  menu.addEventListener('click', async (e) => {
    const item = (e.target as HTMLElement).closest('[data-auth]') as HTMLElement | null;
    if (!item) return;
    menu.classList.remove('open');
    switch (item.dataset.auth) {
      case 'sync':
        await syncToCloud(getState());
        break;
      case 'load': {
        const cloud = await loadFromCloud();
        if (cloud?.tabs?.length) restoreState(cloud);
        break;
      }
      case 'signout':
        await signOut();
        break;
    }
  });

  dropdown.append(btn, menu);
  container.appendChild(dropdown);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
