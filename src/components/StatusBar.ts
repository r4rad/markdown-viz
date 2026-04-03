import { on } from '../lib/events';
import { getActiveTab, getState } from '../lib/state';

export function createStatusBar(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'status-bar';

  el.innerHTML = `
    <span class="status-item" id="status-cursor">Ln 1, Col 1</span>
    <span class="status-item" id="status-words">0 words</span>
    <span class="status-item" id="status-chars">0 chars</span>
    <span class="status-item" id="status-lines">0 lines</span>
    <span class="status-item" id="status-reading">~0 min read</span>
    <span class="status-spacer"></span>
    <span class="status-item" id="status-sync">Sync: On</span>
    <span class="status-item">Markdown</span>
    <span class="status-separator"></span>
    <span class="status-item status-brand">
      <a href="https://rafatahmad.com" target="_blank" rel="noopener" title="Visit rafatahmad.com" class="brand-link">
        <span class="brand-emoji">⬡</span><span class="brand-name">r4rad</span>
      </a>
    </span>
  `;

  on('content-changed', (data: unknown) => {
    const { content } = data as { id: string; content: string };
    updateStats(el, content);
  });

  on('active-tab-changed', (tab: unknown) => {
    const t = tab as { content: string } | null;
    if (t?.content !== undefined) updateStats(el, t.content);
  });

  on('cursor-changed', (data: unknown) => {
    const { line, col } = data as { line: number; col: number };
    el.querySelector('#status-cursor')!.textContent = `Ln ${line}, Col ${col}`;
  });

  on('sync-scroll-changed', (val: unknown) => {
    el.querySelector('#status-sync')!.textContent = `Sync: ${val ? 'On' : 'Off'}`;
  });

  on('state-restored', () => {
    const tab = getActiveTab();
    if (tab) updateStats(el, tab.content);
    el.querySelector('#status-sync')!.textContent = `Sync: ${getState().syncScroll ? 'On' : 'Off'}`;
  });

  // Initialize immediately from current active tab (state may already be restored)
  const tab = getActiveTab();
  if (tab) updateStats(el, tab.content);
  el.querySelector('#status-sync')!.textContent = `Sync: ${getState().syncScroll ? 'On' : 'Off'}`;

  return el;
}

function updateStats(el: HTMLElement, content: string): void {
  const text = content.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const chars = content.length;
  const lines = content.split('\n').length;
  const readingTime = Math.max(1, Math.ceil(words / 200));

  el.querySelector('#status-words')!.textContent = `${words} word${words !== 1 ? 's' : ''}`;
  el.querySelector('#status-chars')!.textContent = `${chars} char${chars !== 1 ? 's' : ''}`;
  el.querySelector('#status-lines')!.textContent = `${lines} line${lines !== 1 ? 's' : ''}`;
  el.querySelector('#status-reading')!.textContent = `~${readingTime} min read`;
}
