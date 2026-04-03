import { on } from '../lib/events';
import {
  isFirebaseReady,
  loadFromCloud,
} from '../lib/auth';
import { restoreState } from '../lib/state';
import { openSettingsMenu } from './SettingsMenu';
import type { UserProfile } from '../types';

let currentProfile: UserProfile | null = null;

export function initAuthUI(): void {
  const authArea = document.getElementById('auth-area');
  if (!authArea) return;

  if (!isFirebaseReady()) {
    authArea.innerHTML = '';
    return;
  }

  renderAvatarButton(authArea, null);

  on('auth-changed', (profile: unknown) => {
    currentProfile = profile as UserProfile | null;
    renderAvatarButton(authArea, currentProfile);
    if (currentProfile) {
      loadFromCloud().then((cloudState) => {
        if (cloudState?.tabs?.length) restoreState(cloudState);
      });
    }
  });
}

function renderAvatarButton(container: HTMLElement, profile: UserProfile | null): void {
  container.innerHTML = '';
  if (!profile) return; // Not signed in — no avatar in top bar

  const btn = document.createElement('button');
  btn.className = 'toolbar-btn auth-avatar-btn';
  btn.title = profile.email || profile.displayName || 'Account';

  if (profile.photoURL) {
    btn.innerHTML = `<img class="user-avatar" src="${escapeHtml(profile.photoURL)}" alt="" />`;
  } else {
    const initial = (profile.displayName || profile.email || 'U').charAt(0).toUpperCase();
    btn.innerHTML = `<span class="user-avatar-initial user-avatar-initial--sm">${initial}</span>`;
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openSettingsMenu();
  });

  container.appendChild(btn);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export { currentProfile };
