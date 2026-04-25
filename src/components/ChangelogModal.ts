/**
 * ChangelogModal
 *
 * Displays a "What's New" popup when the user first opens the app after a new
 * release.  The user can also open it at any time from Settings → What's New.
 */

import {
  CHANGELOG_VERSION,
  CHANGELOG_ENTRIES,
  hasSeenChangelog,
  markChangelogSeen,
} from '../lib/changelog';

const KIND_LABELS: Record<string, string> = {
  feat:  '✨ New',
  fix:   '🐛 Fix',
  perf:  '⚡ Perf',
  chore: '🔧 Chore',
};

const KIND_CLASS: Record<string, string> = {
  feat:  'cl-badge-feat',
  fix:   'cl-badge-fix',
  perf:  'cl-badge-perf',
  chore: 'cl-badge-chore',
};

let overlayEl: HTMLElement | null = null;

/**
 * Opens the changelog modal unconditionally.
 * The `seen` flag is marked when the modal is closed.
 */
export function openChangelogModal(): void {
  if (overlayEl) return; // already open

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay cl-overlay';
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.setAttribute('aria-label', "What's New");

  // Close on backdrop click
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) closeChangelogModal();
  });

  const modal = document.createElement('div');
  modal.className = 'modal cl-modal';

  // ── Header ────────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'modal-header';

  const titleEl = document.createElement('span');
  titleEl.className = 'modal-title';
  titleEl.textContent = "🎉 What's New";

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '×';
  closeBtn.title = 'Close (Esc)';
  closeBtn.addEventListener('click', closeChangelogModal);

  header.append(titleEl, closeBtn);

  // ── Body ──────────────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'modal-body cl-body';

  for (const entry of CHANGELOG_ENTRIES) {
    const section = document.createElement('div');
    section.className = 'cl-section';

    const versionRow = document.createElement('div');
    versionRow.className = 'cl-version-row';

    const versionTag = document.createElement('span');
    versionTag.className = 'cl-version-tag';
    versionTag.textContent = `v${entry.version}`;

    const dateLine = document.createElement('span');
    dateLine.className = 'cl-date';
    dateLine.textContent = formatDate(entry.date);

    versionRow.append(versionTag, dateLine);
    section.appendChild(versionRow);

    const list = document.createElement('ul');
    list.className = 'cl-list';

    for (const item of entry.items) {
      const li = document.createElement('li');
      li.className = 'cl-item';

      const badge = document.createElement('span');
      badge.className = `cl-badge ${KIND_CLASS[item.kind] ?? ''}`;
      badge.textContent = KIND_LABELS[item.kind] ?? item.kind;

      const text = document.createElement('span');
      text.className = 'cl-item-text';
      text.textContent = item.text;

      li.append(badge, text);
      list.appendChild(li);
    }

    section.appendChild(list);
    body.appendChild(section);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer = document.createElement('div');
  footer.className = 'cl-footer';

  const footerText = document.createElement('span');
  footerText.className = 'cl-footer-text';
  footerText.textContent = 'More improvements on the way. Thanks for using MarkdownViz! 💙';

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'dep-btn dep-btn-apply cl-dismiss-btn';
  dismissBtn.textContent = 'Got it!';
  dismissBtn.addEventListener('click', closeChangelogModal);

  footer.append(footerText, dismissBtn);

  modal.append(header, body, footer);
  overlayEl.appendChild(modal);
  document.body.appendChild(overlayEl);

  // Focus the close button for keyboard accessibility
  requestAnimationFrame(() => closeBtn.focus());

  // Keyboard: Escape to close
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { closeChangelogModal(); document.removeEventListener('keydown', onKeydown); }
  };
  document.addEventListener('keydown', onKeydown);
}

export function closeChangelogModal(): void {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  markChangelogSeen(CHANGELOG_VERSION);
}

/**
 * Shows the changelog modal only if the user hasn't seen this version yet.
 * Called automatically on app load.
 */
export function showChangelogIfNew(): void {
  if (!hasSeenChangelog(CHANGELOG_VERSION)) {
    // Small delay so the app fully renders first
    setTimeout(() => openChangelogModal(), 600);
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    return iso;
  }
}
