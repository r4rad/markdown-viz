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

    tabEl.addEventListener('dblclick', (e) => {
      e.preventDefault();
      const input = document.createElement('input');
      input.type = 'text';
      input.value = tab.name;
      input.style.cssText = 'width:100px;height:20px;font-size:12px;border:1px solid var(--border-active);background:var(--bg-input);color:var(--text-primary);padding:0 4px;border-radius:2px;outline:none;';
      nameSpan.replaceWith(input);
      input.focus();
      input.select();
      const finish = () => {
        const val = input.value.trim() || 'Untitled.md';
        updateTabName(tab.id, val);
        input.replaceWith(nameSpan);
        nameSpan.textContent = val;
      };
      input.addEventListener('blur', finish);
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') finish();
        if (ke.key === 'Escape') { input.replaceWith(nameSpan); }
      });
    });

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
