import { getState, switchTab, closeTab, addTab, updateTabName } from '../lib/state';
import { on } from '../lib/events';
import { selectVisibleTabIds } from '../lib/tab-overflow';
import type { FileTab } from '../types';

// Module-level state for mobile close-reveal
let revealedCloseTabId: string | null = null;
let revealAutoHideTimer: ReturnType<typeof setTimeout> | null = null;
let globalDismissListener: ((e: TouchEvent) => void) | null = null;
let pendingLongPressTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;
let overflowMenuOpen = false;

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
  on('state-changed', () => {
    // Recency / rename from elsewhere — keep strip layout in sync without full churn on every keystroke
  });

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(() => render(el));
    resizeObserver.observe(el);
  } else {
    window.addEventListener('resize', () => render(el));
  }

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
  };

  input.addEventListener('blur', () => finish(false));
  input.addEventListener('keydown', (ke) => {
    ke.stopPropagation();
    if (ke.key === 'Enter') { input.blur(); }
    if (ke.key === 'Escape') { finish(true); input.blur(); }
  });
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());
}

function closeOverflowMenu(container: HTMLElement): void {
  overflowMenuOpen = false;
  container.querySelector('.tab-overflow-menu')?.remove();
  container.querySelector('.tab-overflow-btn')?.classList.remove('open');
}

function buildTabButton(tab: FileTab, container: HTMLElement, isTouchDevice: boolean): HTMLButtonElement {
  const state = getState();
  const tabEl = document.createElement('button');
  tabEl.type = 'button';
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
  closeBtn.type = 'button';
  closeBtn.className = 'tab-close';
  closeBtn.innerHTML = '×';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearRevealedClose(container);
    closeOverflowMenu(container);
    closeTab(tab.id);
  });
  tabEl.appendChild(closeBtn);

  if (!isTouchDevice) {
    tabEl.addEventListener('click', () => {
      closeOverflowMenu(container);
      switchTab(tab.id);
    });
    tabEl.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const liveNameSpan = container.querySelector(`[data-tab-id="${tab.id}"] .tab-name`) as HTMLElement | null;
      if (liveNameSpan) startInlineRename(tab.id, liveNameSpan);
    });
  } else {
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
      if (revealedCloseTabId === tab.id) { clearRevealedClose(container); }
      closeOverflowMenu(container);
      switchTab(tab.id);
    });
  }

  return tabEl;
}

function render(container: HTMLElement): void {
  if (pendingLongPressTimer) { clearTimeout(pendingLongPressTimer); pendingLongPressTimer = null; }

  const state = getState();
  const wasOverflowOpen = overflowMenuOpen;
  container.innerHTML = '';
  overflowMenuOpen = false;

  const isTouchDevice = 'ontouchstart' in window;
  const addBtnWidth = 32;
  const overflowChrome = 40;
  const available = Math.max(0, container.clientWidth - addBtnWidth);
  const tabInputs = state.tabs.map((t) => ({
    id: t.id,
    name: t.name,
    lastOpenedAt: t.lastOpenedAt ?? t.updatedAt,
  }));

  // Before layout, clientWidth can be 0 — show all tabs until ResizeObserver reflows.
  const layout = container.clientWidth <= 0
    ? { visibleIds: state.tabs.map((t) => t.id), overflowIds: [] as string[] }
    : (() => {
        const firstPass = selectVisibleTabIds(tabInputs, state.activeTabId, available, {
          overflowChromeWidth: 0,
        });
        return firstPass.overflowIds.length > 0
          ? selectVisibleTabIds(tabInputs, state.activeTabId, available, {
              overflowChromeWidth: overflowChrome,
            })
          : firstPass;
      })();

  const tabsById = new Map(state.tabs.map((t) => [t.id, t]));
  for (const id of layout.visibleIds) {
    const tab = tabsById.get(id);
    if (tab) container.appendChild(buildTabButton(tab, container, isTouchDevice));
  }

  if (layout.overflowIds.length > 0) {
    const overflowWrap = document.createElement('div');
    overflowWrap.className = 'tab-overflow';

    const overflowBtn = document.createElement('button');
    overflowBtn.type = 'button';
    overflowBtn.className = 'tab-overflow-btn';
    overflowBtn.title = 'List all tabs';
    overflowBtn.setAttribute('aria-haspopup', 'menu');
    overflowBtn.setAttribute('aria-expanded', 'false');
    overflowBtn.innerHTML = `<span class="tab-overflow-label">${layout.overflowIds.length}</span><span class="tab-overflow-caret" aria-hidden="true">▾</span>`;

    overflowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (overflowMenuOpen) {
        closeOverflowMenu(container);
        return;
      }
      overflowMenuOpen = true;
      overflowBtn.classList.add('open');
      overflowBtn.setAttribute('aria-expanded', 'true');

      const menu = document.createElement('div');
      menu.className = 'tab-overflow-menu';
      menu.setAttribute('role', 'menu');

      for (const id of layout.overflowIds) {
        const tab = tabsById.get(id);
        if (!tab) continue;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'tab-overflow-item';
        item.setAttribute('role', 'menuitem');
        item.dataset.tabId = tab.id;
        item.innerHTML = `<span class="tab-overflow-item-name">${escapeHtml(tab.name)}</span>${tab.dirty ? '<span class="tab-dirty"></span>' : ''}`;
        item.addEventListener('click', (ev) => {
          ev.stopPropagation();
          closeOverflowMenu(container);
          switchTab(tab.id);
        });
        menu.appendChild(item);
      }

      overflowWrap.appendChild(menu);
      const dismiss = (ev: MouseEvent) => {
        if (!(ev.target as HTMLElement).closest('.tab-overflow')) {
          closeOverflowMenu(container);
          document.removeEventListener('click', dismiss);
        }
      };
      setTimeout(() => document.addEventListener('click', dismiss), 0);
    });

    overflowWrap.appendChild(overflowBtn);
    container.appendChild(overflowWrap);

    if (wasOverflowOpen) {
      overflowBtn.click();
    }
  }

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'tab-add';
  addBtn.innerHTML = '+';
  addBtn.title = 'New file';
  addBtn.addEventListener('click', () => {
    closeOverflowMenu(container);
    addTab();
  });
  container.appendChild(addBtn);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
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
  // Overflow items may also show dirty — re-render strip only when overflow exists
  if (container.querySelector('.tab-overflow') && state.tabs.some((t) => t.dirty)) {
    // cheap: update overflow menu dots if open
    for (const tab of state.tabs) {
      const item = container.querySelector(`.tab-overflow-item[data-tab-id="${tab.id}"]`);
      if (!item) continue;
      const existing = item.querySelector('.tab-dirty');
      if (tab.dirty && !existing) {
        item.insertAdjacentHTML('beforeend', '<span class="tab-dirty"></span>');
      } else if (!tab.dirty && existing) {
        existing.remove();
      }
    }
  }
}
