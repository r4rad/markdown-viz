import { canEditActiveWorkspace, getState, setTemplateSettings, updateTabContent } from '../lib/state';
import { listedTemplates, createFromTemplate, duplicateTemplateToWorkspace, persistTemplateSettings, ensurePackFolders } from '../lib/template-actions';
import type { DocType } from '../types';

function overlay(html: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'workspace-modal-overlay';
  el.innerHTML = `<div class="workspace-modal">${html}</div>`;
  el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
  document.body.appendChild(el);
  return el;
}

export function openTemplatePicker(): void {
  if (!canEditActiveWorkspace()) {
    window.alert('Viewers cannot create documents from templates.');
    return;
  }
  ensurePackFolders();
  const templates = listedTemplates();
  const packs = [...new Set(templates.map(t => t.pack))];
  const options = templates.map(t =>
    `<option value="${t.id}">${t.pack} / ${t.docType}</option>`,
  ).join('');
  const el = overlay(`
    <h3>New from template</h3>
    <p>${packs.join(', ')}</p>
    <select id="tpl-id">${options}</select>
    <input id="tpl-title" placeholder="Title" style="width:100%;margin-top:8px" />
    <p><button id="tpl-go">Create</button>
    <button id="tpl-dup">Duplicate into Templates/</button>
    <button data-x="1">Close</button></p>`);
  el.querySelector('#tpl-go')!.addEventListener('click', () => {
    const id = (el.querySelector('#tpl-id') as HTMLSelectElement).value;
    const title = (el.querySelector('#tpl-title') as HTMLInputElement).value.trim() || 'Untitled';
    const result = createFromTemplate({ templateIdOrDocType: id, title });
    if (!result.ok) window.alert(result.error);
    el.remove();
  });
  el.querySelector('#tpl-dup')!.addEventListener('click', () => {
    const id = (el.querySelector('#tpl-id') as HTMLSelectElement).value;
    const meta = templates.find(t => t.id === id);
    if (!meta) return;
    const result = duplicateTemplateToWorkspace(meta.docType);
    if (!result.ok) window.alert(result.error);
    else window.alert('Copied to Templates/ with default: true');
    el.remove();
  });
  el.querySelector('[data-x]')!.addEventListener('click', () => el.remove());
}

export function openQuickNote(): void {
  if (!canEditActiveWorkspace()) {
    window.alert('Viewers cannot capture notes.');
    return;
  }
  const el = overlay(`
    <h3>Quick note</h3>
    <input id="note-title" placeholder="Title (optional)" style="width:100%" />
    <p><button id="note-go">Create</button> <button data-x="1">Cancel</button></p>`);
  el.querySelector('#note-go')!.addEventListener('click', () => {
    const title = (el.querySelector('#note-title') as HTMLInputElement).value.trim() || `Note ${new Date().toISOString().slice(0, 10)}`;
    const result = createFromTemplate({ templateIdOrDocType: 'note', title, autoSave: true });
    if (!result.ok) window.alert(result.error);
    el.remove();
  });
  el.querySelector('[data-x]')!.addEventListener('click', () => el.remove());
}

export function openResearchCapture(): void {
  if (!canEditActiveWorkspace()) {
    window.alert('Viewers cannot save research.');
    return;
  }
  const el = overlay(`
    <h3>Save research</h3>
    <input id="r-title" placeholder="Title" style="width:100%" />
    <input id="r-url" placeholder="Source URL" style="width:100%;margin-top:6px" />
    <textarea id="r-body" placeholder="Notes" rows="4" style="width:100%;margin-top:6px"></textarea>
    <p><button id="r-go">Save</button> <button data-x="1">Cancel</button></p>`);
  el.querySelector('#r-go')!.addEventListener('click', () => {
    const title = (el.querySelector('#r-title') as HTMLInputElement).value.trim();
    const url = (el.querySelector('#r-url') as HTMLInputElement).value.trim();
    const extra = (el.querySelector('#r-body') as HTMLTextAreaElement).value;
    if (!title) { window.alert('Title is required.'); return; }
    const result = createFromTemplate({ templateIdOrDocType: 'research', title, url, autoSave: true });
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    if (extra) {
      const tab = getState().tabs.find(t => t.id === result.fileId);
      if (tab) updateTabContent(tab.id, `${tab.content}\n\n${extra}`);
    }
    el.remove();
  });
  el.querySelector('[data-x]')!.addEventListener('click', () => el.remove());
}

export function renderTemplateSettings(container: HTMLElement): void {
  ensurePackFolders();
  const state = getState();
  const folders = state.folders;
  const settings = { ...state.templateSettings, folderByDocType: { ...state.templateSettings.folderByDocType } };
  const types: DocType[] = [
    'prd', 'brd', 'task_breakdown', 'architecture', 'meeting_notes',
    'content_plan', 'strategy', 'content_calendar', 'note', 'research',
  ];
  const wrap = document.createElement('div');
  wrap.innerHTML = '<div class="settings-sublabel">Map each doc type to a folder. Defaults: Engineering, Marketing, Notes, Notes/Research.</div>';
  for (const dt of types) {
    const row = document.createElement('label');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.marginTop = '6px';
    const sel = document.createElement('select');
    for (const f of folders) {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      sel.appendChild(opt);
    }
    const current = dt === 'note' ? settings.captureNoteFolderId || settings.folderByDocType[dt]
      : dt === 'research' ? settings.captureResearchFolderId || settings.folderByDocType[dt]
      : settings.folderByDocType[dt];
    if (current) sel.value = current;
    sel.addEventListener('change', () => {
      if (dt === 'note') settings.captureNoteFolderId = sel.value;
      else if (dt === 'research') settings.captureResearchFolderId = sel.value;
      else settings.folderByDocType[dt] = sel.value;
      setTemplateSettings(settings);
      persistTemplateSettings(settings).catch(console.error);
    });
    row.append(document.createTextNode(dt), sel);
    wrap.appendChild(row);
  }
  container.appendChild(wrap);
}
