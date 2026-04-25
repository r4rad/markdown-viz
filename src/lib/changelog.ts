export interface ChangelogItem {
  kind: 'feat' | 'fix' | 'perf' | 'chore';
  text: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  items: ChangelogItem[];
}

// Bump this whenever a new release warrants showing the popup again.
export const CHANGELOG_VERSION = '1.1.0';

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-04-25',
    items: [
      { kind: 'feat', text: '/draw slash command — type /draw in the editor to insert a diagram block with a type picker (Mermaid, Nomnoml, DOT/Graphviz).' },
      { kind: 'feat', text: 'Inline diagram editor — click ✏️ Edit on any rendered diagram to open a live in-place panel: edit source, switch diagram type, and see the result instantly before applying.' },
      { kind: 'feat', text: 'Changelog popup — see what\'s new on every major release, accessible any time from Settings → What\'s New.' },
      { kind: 'fix',  text: 'Preview scroll position now correctly restored when switching between tabs.' },
      { kind: 'perf', text: 'Scroll sync debounce tightened — less jitter when syncing editor ↔ preview scroll positions.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-01-10',
    items: [
      { kind: 'feat', text: 'Initial release — CodeMirror 6 editor, live GFM preview, Mermaid / Nomnoml / DOT diagrams, 17 themes, AI audio, cloud sync, CRDT collaboration.' },
    ],
  },
];

const STORAGE_KEY = 'mv-changelog-seen';

function loadSeen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function hasSeenChangelog(version: string = CHANGELOG_VERSION): boolean {
  return !!loadSeen()[version];
}

export function markChangelogSeen(version: string = CHANGELOG_VERSION): void {
  try {
    const seen = loadSeen();
    seen[version] = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // localStorage may be unavailable (private browsing, storage quota)
  }
}

/** Testing helper — removes all persisted changelog-seen data. */
export function clearChangelogSeen(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
