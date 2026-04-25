/**
 * DiagramEditPanel
 *
 * A Confluence-style inline diagram editor that appears when the user clicks
 * "Edit" on a rendered diagram in the preview pane.  The panel shows:
 *   • A diagram-type dropdown (Mermaid / Nomnoml / DOT)
 *   • A <textarea> with the current diagram source
 *   • A live preview that re-renders on every keystroke
 *   • Apply / Cancel buttons
 *
 * Also exports `openDiagramInsertPanel` for creating new diagrams from the
 * preview pane's floating "/draw" button.
 *
 * On Apply, an 'update-diagram-source' event is emitted so the editor pane
 * can update the underlying markdown.
 */

import { emit } from '../lib/events';
import {
  DIAGRAM_TYPES, DIAGRAM_LABELS, DIAGRAM_TEMPLATES,
  isValidDiagramType, replaceDiagramType,
  type DiagramType,
} from '../lib/draw-command';

export interface DiagramEditPanelOptions {
  /** The diagram container element to which the panel is appended. */
  container: HTMLElement;
  /** Current diagram type. */
  type: DiagramType;
  /** Current diagram source code (without fence markers). */
  source: string;
  /** Original encoded source for identity matching. */
  encodedSource: string;
  /**
   * Called when the user clicks Apply.  The new markdown fence is passed so
   * callers can splice it back into the editor document.
   */
  onApply: (newFence: string, oldEncodedSource: string) => void;
}

/** Currently open insert-mode overlay (only one can exist at a time). */
let insertOverlayEl: HTMLElement | null = null;

/** Opens (or replaces) the edit panel attached to a diagram container. */
export function openDiagramEditPanel(opts: DiagramEditPanelOptions): void {
  // Remove any existing panel on this container first
  closeDiagramEditPanel(opts.container);

  const panel = buildPanel(opts);
  // Insert the panel right after the diagram container so it feels "attached"
  opts.container.insertAdjacentElement('afterend', panel);

  // Scroll the panel smoothly into view
  requestAnimationFrame(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

/** Removes the edit panel attached to a diagram container, if present. */
export function closeDiagramEditPanel(container: HTMLElement): void {
  const existing = container.nextElementSibling;
  if (existing?.classList.contains('diagram-edit-panel')) {
    existing.remove();
  }
}

/**
 * Opens (or toggles) a "Insert Diagram" panel anchored to the preview pane.
 * The panel is mounted as a sibling of the content div inside previewPane so
 * it is never wiped by renderContent() replacing innerHTML.
 */
export function openDiagramInsertPanel(
  previewPane: HTMLElement,
  onInsert: (fence: string) => void,
): void {
  // Toggle: if already open, close it
  if (insertOverlayEl && previewPane.contains(insertOverlayEl)) {
    insertOverlayEl.remove();
    insertOverlayEl = null;
    return;
  }
  // Close any stale overlay from another pane
  insertOverlayEl?.remove();

  insertOverlayEl = document.createElement('div');
  insertOverlayEl.className = 'diagram-insert-overlay';

  const panel = buildInsertPanel(
    (fence) => {
      onInsert(fence);
      insertOverlayEl?.remove();
      insertOverlayEl = null;
    },
    () => {
      insertOverlayEl?.remove();
      insertOverlayEl = null;
    },
  );

  insertOverlayEl.appendChild(panel);
  previewPane.appendChild(insertOverlayEl);

  // Focus the textarea after mount
  requestAnimationFrame(() => {
    panel.querySelector<HTMLTextAreaElement>('.dep-textarea')?.focus();
  });
}

// ─── Edit panel construction ──────────────────────────────────────────────────

function buildPanel(opts: DiagramEditPanelOptions): HTMLElement {
  let currentType = opts.type;
  let currentSource = opts.source;

  // Each panel owns its own debounce timer — no shared module-level state
  let liveRenderTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleLiveRender() {
    if (liveRenderTimer) clearTimeout(liveRenderTimer);
    liveRenderTimer = setTimeout(() => renderLivePreview(currentType, currentSource, previewArea), 300);
  }

  const panel = document.createElement('div');
  panel.className = 'diagram-edit-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Edit diagram');

  // ── Header ────────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'dep-header';

  const title = document.createElement('span');
  title.className = 'dep-title';
  title.textContent = '✏️ Edit Diagram';

  // Diagram type selector
  const typeSelect = document.createElement('select');
  typeSelect.className = 'dep-type-select';
  typeSelect.setAttribute('aria-label', 'Diagram type');
  for (const t of DIAGRAM_TYPES) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = DIAGRAM_LABELS[t];
    opt.selected = t === currentType;
    typeSelect.appendChild(opt);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'dep-close-btn';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Close without saving (Esc)';
  closeBtn.addEventListener('click', () => {
    panel.remove();
  });

  header.append(title, typeSelect, closeBtn);

  // ── Body: editor + live preview ───────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'dep-body';

  // Code editor
  const editorWrap = document.createElement('div');
  editorWrap.className = 'dep-editor-wrap';

  const editorLabel = document.createElement('label');
  editorLabel.className = 'dep-label';
  editorLabel.textContent = 'Diagram source';

  const textarea = document.createElement('textarea');
  textarea.className = 'dep-textarea';
  textarea.value = currentSource;
  textarea.setAttribute('spellcheck', 'false');
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('aria-label', 'Diagram source code');

  editorWrap.append(editorLabel, textarea);

  // Live preview
  const previewWrap = document.createElement('div');
  previewWrap.className = 'dep-preview-wrap';

  const previewLabel = document.createElement('label');
  previewLabel.className = 'dep-label';
  previewLabel.textContent = 'Live preview';

  const previewArea = document.createElement('div');
  previewArea.className = 'dep-preview-area';
  previewArea.innerHTML = '<span class="dep-preview-hint">Rendering…</span>';

  previewWrap.append(previewLabel, previewArea);
  body.append(editorWrap, previewWrap);

  // ── Footer: Apply / Cancel ────────────────────────────────────────────────
  const footer = document.createElement('div');
  footer.className = 'dep-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'dep-btn dep-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => panel.remove());

  const applyBtn = document.createElement('button');
  applyBtn.className = 'dep-btn dep-btn-apply';
  applyBtn.textContent = 'Apply';
  applyBtn.addEventListener('click', () => {
    const newFence = replaceDiagramType(currentSource, currentType);
    opts.onApply(newFence, opts.encodedSource);
    panel.remove();
  });

  const hint = document.createElement('span');
  hint.className = 'dep-footer-hint';
  hint.textContent = 'Changes update the editor source.';

  footer.append(hint, cancelBtn, applyBtn);

  // ── Wire up events ────────────────────────────────────────────────────────
  textarea.addEventListener('input', () => {
    currentSource = textarea.value;
    scheduleLiveRender();
  });

  typeSelect.addEventListener('change', () => {
    const val = typeSelect.value;
    if (isValidDiagramType(val)) {
      currentType = val;
      scheduleLiveRender();
    }
  });

  // Dismiss on Escape
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); panel.remove(); }
  });

  panel.append(header, body, footer);

  // Initial live render
  scheduleLiveRender();

  return panel;
}

// ─── Insert panel construction ────────────────────────────────────────────────

function buildInsertPanel(
  onInsert: (fence: string) => void,
  onClose: () => void,
): HTMLElement {
  let currentType: DiagramType = 'mermaid';
  let currentSource = DIAGRAM_TEMPLATES[currentType];
  // Track whether the textarea still holds an unmodified template
  let lastAutoFilledTemplate = currentSource;

  let liveRenderTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleLiveRender() {
    if (liveRenderTimer) clearTimeout(liveRenderTimer);
    liveRenderTimer = setTimeout(() => renderLivePreview(currentType, currentSource, previewArea), 300);
  }

  const panel = document.createElement('div');
  panel.className = 'diagram-edit-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Insert diagram');

  // ── Header ────────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'dep-header';

  const title = document.createElement('span');
  title.className = 'dep-title';
  title.textContent = '➕ Insert Diagram';

  const typeSelect = document.createElement('select');
  typeSelect.className = 'dep-type-select';
  typeSelect.setAttribute('aria-label', 'Diagram type');
  for (const t of DIAGRAM_TYPES) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = DIAGRAM_LABELS[t];
    opt.selected = t === currentType;
    typeSelect.appendChild(opt);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'dep-close-btn';
  closeBtn.innerHTML = '✕';
  closeBtn.title = 'Close (Esc)';
  closeBtn.addEventListener('click', onClose);

  header.append(title, typeSelect, closeBtn);

  // ── Body: editor + live preview ───────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'dep-body';

  const editorWrap = document.createElement('div');
  editorWrap.className = 'dep-editor-wrap';

  const editorLabel = document.createElement('label');
  editorLabel.className = 'dep-label';
  editorLabel.textContent = 'Diagram source';

  const textarea = document.createElement('textarea');
  textarea.className = 'dep-textarea';
  textarea.value = currentSource;
  textarea.setAttribute('spellcheck', 'false');
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('aria-label', 'Diagram source code');

  editorWrap.append(editorLabel, textarea);

  const previewWrap = document.createElement('div');
  previewWrap.className = 'dep-preview-wrap';

  const previewLabel = document.createElement('label');
  previewLabel.className = 'dep-label';
  previewLabel.textContent = 'Live preview';

  const previewArea = document.createElement('div');
  previewArea.className = 'dep-preview-area';
  previewArea.innerHTML = '<span class="dep-preview-hint">Rendering…</span>';

  previewWrap.append(previewLabel, previewArea);
  body.append(editorWrap, previewWrap);

  // ── Footer: Insert / Cancel ───────────────────────────────────────────────
  const footer = document.createElement('div');
  footer.className = 'dep-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'dep-btn dep-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', onClose);

  const insertBtn = document.createElement('button');
  insertBtn.className = 'dep-btn dep-btn-apply';
  insertBtn.textContent = 'Insert';
  insertBtn.addEventListener('click', () => {
    if (!currentSource.trim()) return;
    onInsert(replaceDiagramType(currentSource, currentType));
  });

  const hint = document.createElement('span');
  hint.className = 'dep-footer-hint';
  hint.textContent = 'Appends a new diagram block to your document.';

  footer.append(hint, cancelBtn, insertBtn);

  // ── Wire up events ────────────────────────────────────────────────────────
  textarea.addEventListener('input', () => {
    currentSource = textarea.value;
    scheduleLiveRender();
  });

  typeSelect.addEventListener('change', () => {
    const val = typeSelect.value;
    if (!isValidDiagramType(val)) return;
    // Only replace textarea content with the new template if the user hasn't
    // edited it away from the previously auto-filled template
    if (currentSource === lastAutoFilledTemplate) {
      currentSource = DIAGRAM_TEMPLATES[val];
      textarea.value = currentSource;
      lastAutoFilledTemplate = currentSource;
    }
    currentType = val;
    scheduleLiveRender();
  });

  // Dismiss on Escape
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  });

  panel.append(header, body, footer);
  scheduleLiveRender();

  return panel;
}

// ─── Live preview rendering ───────────────────────────────────────────────────

async function renderLivePreview(type: DiagramType, source: string, area: HTMLElement): Promise<void> {
  area.innerHTML = '<span class="dep-preview-hint">Rendering…</span>';

  if (!source.trim()) {
    area.innerHTML = '<span class="dep-preview-hint dep-preview-empty">Start typing your diagram…</span>';
    return;
  }

  try {
    if (type === 'mermaid') {
      await renderMermaidPreview(source, area);
    } else if (type === 'nomnoml') {
      await renderNomnomlPreview(source, area);
    } else {
      await renderGraphvizPreview(source, area);
    }
  } catch (err) {
    area.innerHTML = `<span class="dep-preview-error">⚠️ ${escapeHtml(String(err))}</span>`;
  }
}

async function renderMermaidPreview(source: string, area: HTMLElement): Promise<void> {
  const mermaid = await import('mermaid');
  const themeType = document.documentElement.getAttribute('data-theme-type');
  mermaid.default.initialize({
    startOnLoad: false,
    theme: themeType === 'dark' ? 'dark' : 'default',
    securityLevel: 'loose',
  });
  const id = `dep-mermaid-${crypto.randomUUID().slice(0, 8)}`;
  const { svg } = await mermaid.default.render(id, source);
  area.innerHTML = svg;
}

async function renderNomnomlPreview(source: string, area: HTMLElement): Promise<void> {
  const nomnoml = await import('nomnoml');
  const svg = nomnoml.renderSvg(source);
  area.innerHTML = svg;
}

async function renderGraphvizPreview(source: string, area: HTMLElement): Promise<void> {
  const { instance } = await import('@viz-js/viz');
  const viz = await instance();
  const svgEl = viz.renderSVGElement(source);
  area.innerHTML = '';
  area.appendChild(svgEl);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Exported helper to wire up "Apply" → editor update ──────────────────────

/**
 * Replaces the old diagram fence in the markdown string with the new one.
 * Used by Preview.ts to update the editor after the panel's Apply is clicked.
 */
export function applyDiagramEdit(
  markdown: string,
  oldEncodedSource: string,
  newFence: string,
): string {
  const oldSource = decodeURIComponent(oldEncodedSource);
  // Build a regex that matches the old fence regardless of type prefix
  const escaped = oldSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fenceRegex = new RegExp('```[\\w]+\\n' + escaped + '\\n```');
  const updated = markdown.replace(fenceRegex, newFence);
  // If the regex didn't match (e.g. content was already edited), append as fallback
  return updated === markdown ? markdown + '\n' + newFence + '\n' : updated;
}

// Re-export for event-based wiring in Preview.ts
export { emit as _emit };
