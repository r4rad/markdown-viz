import { getState, switchTab, closeTab, addTab, updateTabName } from '../lib/state';
import { on } from '../lib/events';

export function createTabBar(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tab-bar';
  render(el);

  on('tab-added', () => render(el));
  on('tab-closed', () => render(el));
  on('active-tab-changed', () => render(el));
  on('tab-renamed', () => render(el));
  on('content-changed', () => updateDirty(el));
  on('state-restored', () => render(el));

  return el;
}

function startInlineRename(tabId: string, nameSpan: HTMLElement): void {
  if (nameSpan.querySelector('input')) return; // already editing

  const currentName = nameSpan.textContent || '';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'tab-rename-input';
  nameSpan.textContent = '';
  nameSpan.appendChild(input);
  input.focus();
  input.select();

  const finish = (cancel = false) => {
    const val = cancel ? currentName : (input.value.trim() || currentName);
    updateTabName(tabId, val);
    // render() will be called via tab-renamed event
  };

  input.addEventListener('blur', () => finish(false));
  input.addEventListener('keydown', (ke) => {
    ke.stopPropagation();
    if (ke.key === 'Enter') { input.blur(); }
    if (ke.key === 'Escape') { finish(true); input.blur(); }
  });
  // Prevent click on input from switching tabs
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());
}

function render(container: HTMLElement): void {
  const state = getState();
  container.innerHTML = '';

  for (const tab of state.tabs) {
    const tabEl = document.createElement('button');
    tabEl.className = `tab ${tab.id === state.activeTabId ? 'active' : ''}`;
    tabEl.dataset.tabId = tab.id;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = tab.name;
    nameSpan.title = tab.name;
    tabEl.appendChild(nameSpan);

    if (tab.dirty) {
      const dot = document.createElement('span');
      dot.className = 'tab-dirty';
      tabEl.appendChild(dot);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = '×';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    tabEl.appendChild(closeBtn);

    tabEl.addEventListener('click', () => switchTab(tab.id));

    // Desktop: double-click to rename
    tabEl.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Re-query live DOM — click may have triggered a re-render via switchTab
      const liveNameSpan = container.querySelector(`[data-tab-id="${tab.id}"] .tab-name`) as HTMLElement | null;
      if (liveNameSpan) startInlineRename(tab.id, liveNameSpan);
    });

    // Mobile: long-tap (600ms) to rename
    let longTapTimer: ReturnType<typeof setTimeout> | null = null;
    tabEl.addEventListener('touchstart', () => {
      longTapTimer = setTimeout(() => {
        longTapTimer = null;
        const liveNameSpan = container.querySelector(`[data-tab-id="${tab.id}"] .tab-name`) as HTMLElement | null;
        if (liveNameSpan) startInlineRename(tab.id, liveNameSpan);
      }, 600);
    }, { passive: true });
    const cancelLongTap = () => {
      if (longTapTimer) { clearTimeout(longTapTimer); longTapTimer = null; }
    };
    tabEl.addEventListener('touchend', cancelLongTap, { passive: true });
    tabEl.addEventListener('touchmove', cancelLongTap, { passive: true });

    container.appendChild(tabEl);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'tab-add';
  addBtn.innerHTML = '+';
  addBtn.title = 'New file';
  addBtn.addEventListener('click', () => addTab());
  container.appendChild(addBtn);
}

function updateDirty(container: HTMLElement): void {
  const state = getState();
  for (const tab of state.tabs) {
    const tabEl = container.querySelector(`[data-tab-id="${tab.id}"]`);
    if (!tabEl) continue;
    const existing = tabEl.querySelector('.tab-dirty');
    if (tab.dirty && !existing) {
      const dot = document.createElement('span');
      dot.className = 'tab-dirty';
      tabEl.querySelector('.tab-name')?.after(dot);
    } else if (!tab.dirty && existing) {
      existing.remove();
    }
  }
}

