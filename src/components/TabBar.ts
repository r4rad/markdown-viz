import { getState, switchTab, closeTab, addTab, updateTabName } from '../lib/state';
import { on } from '../lib/events';

// Module-level state for mobile close-reveal
let revealedCloseTabId: string | null = null;
let revealAutoHideTimer: ReturnType<typeof setTimeout> | null = null;
let globalDismissListener: ((e: TouchEvent) => void) | null = null;
let pendingLongPressTimer: ReturnType<typeof setTimeout> | null = null;

function clearRevealedClose(container: HTMLElement): void {
  if (revealAutoHideTimer) { clearTimeout(revealAutoHideTimer); revealAutoHideTimer = null; }
  if (globalDismissListener) {
    document.removeEventListener('touchstart', globalDismissListener as EventListener);
    globalDismissListener = null;
  }
  revealedCloseTabId = null;
  container.querySelectorAll('.tab.show-close').forEach(t => t.classList.remove('show-close'));
}

function showCloseForTab(tabId: string, container: HTMLElement): void {
  clearRevealedClose(container);
  revealedCloseTabId = tabId;
  const tabEl = container.querySelector(`[data-tab-id="${tabId}"]`);
  if (tabEl) tabEl.classList.add('show-close');

  revealAutoHideTimer = setTimeout(() => clearRevealedClose(container), 4000);

  globalDismissListener = (e: TouchEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest(`[data-tab-id="${tabId}"]`)) {
      clearRevealedClose(container);
    }
  };
  document.addEventListener('touchstart', globalDismissListener as EventListener, { passive: true });
}

function scrollActiveTabIntoView(container: HTMLElement): void {
  requestAnimationFrame(() => {
    const activeEl = container.querySelector('.tab.active') as HTMLElement | null;
    if (activeEl) activeEl.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
  });
}

export function createTabBar(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tab-bar';
  render(el);

  on('tab-added', () => render(el));
  on('tab-closed', () => render(el));
  on('active-tab-changed', () => { render(el); scrollActiveTabIntoView(el); });
  on('tab-renamed', () => render(el));
  on('content-changed', () => updateDirty(el));
  on('state-restored', () => { render(el); scrollActiveTabIntoView(el); });

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
  // Cancel any in-flight long-press timer from previous DOM elements
  if (pendingLongPressTimer) { clearTimeout(pendingLongPressTimer); pendingLongPressTimer = null; }

  const state = getState();
  container.innerHTML = '';

  const isTouchDevice = 'ontouchstart' in window;

  for (const tab of state.tabs) {
    const tabEl = document.createElement('button');
    tabEl.className = `tab ${tab.id === state.activeTabId ? 'active' : ''}${tab.id === revealedCloseTabId ? ' show-close' : ''}`;
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
      clearRevealedClose(container);
      closeTab(tab.id);
    });
    tabEl.appendChild(closeBtn);

    if (!isTouchDevice) {
      // Desktop: click switches, double-click renames
      tabEl.addEventListener('click', () => switchTab(tab.id));
      tabEl.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const liveNameSpan = container.querySelector(`[data-tab-id="${tab.id}"] .tab-name`) as HTMLElement | null;
        if (liveNameSpan) startInlineRename(tab.id, liveNameSpan);
      });
    } else {
      // Mobile: tap switches, long-press (600ms) reveals close button
      let swiping = false;
      let longPressJustFired = false;

      tabEl.addEventListener('touchstart', () => {
        swiping = false;
        longPressJustFired = false;
        if (pendingLongPressTimer) { clearTimeout(pendingLongPressTimer); }
        pendingLongPressTimer = setTimeout(() => {
          pendingLongPressTimer = null;
          if (!swiping) {
            longPressJustFired = true;
            showCloseForTab(tab.id, container);
          }
        }, 600);
      }, { passive: true });

      const cancelLongPress = () => {
        if (pendingLongPressTimer) { clearTimeout(pendingLongPressTimer); pendingLongPressTimer = null; }
      };
      tabEl.addEventListener('touchmove', () => { swiping = true; cancelLongPress(); }, { passive: true });
      tabEl.addEventListener('touchend', cancelLongPress, { passive: true });
      tabEl.addEventListener('touchcancel', () => { swiping = false; cancelLongPress(); }, { passive: true });

      tabEl.addEventListener('click', () => {
        if (longPressJustFired) { longPressJustFired = false; return; }
        // If this tab had close revealed, a tap on the tab body dismisses close and switches
        if (revealedCloseTabId === tab.id) { clearRevealedClose(container); }
        switchTab(tab.id);
      });
    }

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

