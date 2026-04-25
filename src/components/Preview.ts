import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getActiveTab, getState, setPreviewScroll, updateTabContent } from '../lib/state';
import { on, emit } from '../lib/events';
import { htmlToMarkdown } from '../lib/html-to-markdown';
import { isValidDiagramType, type DiagramType } from '../lib/draw-command';
import { openDiagramEditPanel, openDiagramInsertPanel, applyDiagramEdit } from './DiagramEditPanel';

let previewEl: HTMLElement;
let contentEl: HTMLElement;
let renderTimer: ReturnType<typeof setTimeout> | null = null;
let previewEditable = false;
const headingSlugCounts = new Map<string, number>();
let highlightModule: typeof import('highlight.js') | null = null;
let katexModule: typeof import('katex') | null = null;
let mermaidModule: typeof import('mermaid') | null = null;
let mermaidReady = false;

const RENDER_DELAY = 150;

// Emoji map (common shortcodes)
const EMOJI_MAP: Record<string, string> = {
  '+1': '👍', '-1': '👎', heart: '❤️', smile: '😄', laughing: '😆',
  wink: '😉', cry: '😢', rage: '😡', rocket: '🚀', star: '⭐',
  fire: '🔥', check: '✅', x: '❌', warning: '⚠️', bulb: '💡',
  memo: '📝', book: '📖', link: '🔗', eyes: '👀', tada: '🎉',
  sparkles: '✨', zap: '⚡', bug: '🐛', wrench: '🔧', lock: '🔒',
  key: '🔑', globe: '🌍', sun: '☀️', moon: '🌙', cloud: '☁️',
  umbrella: '☂️', snowflake: '❄️', coffee: '☕', pizza: '🍕',
  thumbsup: '👍', thumbsdown: '👎', clap: '👏', wave: '👋',
  thinking: '🤔', shrug: '🤷', facepalm: '🤦', party_popper: '🎉',
  100: '💯', muscle: '💪', pray: '🙏', earth_americas: '🌎',
  chart_with_upwards_trend: '📈', package: '📦', gear: '⚙️',
  heavy_check_mark: '✔️', arrow_right: '➡️', arrow_left: '⬅️',
  information_source: 'ℹ️', exclamation: '❗', question: '❓',
  penguin: '🐧', snake: '🐍', whale: '🐳', dog: '🐶', cat: '🐱',
};

const ALERT_ICONS: Record<string, string> = {
  note: 'ℹ️', tip: '💡', important: '🔮', warning: '⚠️', caution: '🔴',
};

function configureMarked(): void {
  // Use marked.use() with proper v17 API for renderer overrides
  marked.use({
    gfm: true,
    breaks: true,
    renderer: {
      // Add IDs to headings for TOC scroll navigation
      heading({ tokens, depth }: { tokens: any[]; depth: number }): string {
        const text = this.parser.parseInline(tokens);
        const rawSlug = slugify(text);
        const count = headingSlugCounts.get(rawSlug) || 0;
        headingSlugCounts.set(rawSlug, count + 1);
        const slug = count > 0 ? `${rawSlug}-${count}` : rawSlug;
        return `<h${depth} id="${slug}">${text}</h${depth}>\n`;
      },

      // Custom code block renderer for diagrams
      code({ text, lang }: { text: string; lang?: string; escaped?: boolean }): string {
        const language = (lang || '').toLowerCase().trim();

        if (language === 'mermaid') {
          return `<div class="diagram-container" data-diagram="mermaid" data-source="${encodeURIComponent(text)}"><pre class="mermaid">${escapeHtml(text)}</pre></div>`;
        }

        if (language === 'dot' || language === 'graphviz') {
          return `<div class="diagram-container" data-diagram="graphviz" data-source="${encodeURIComponent(text)}"><pre class="graphviz-pending">${escapeHtml(text)}</pre></div>`;
        }

        if (language === 'nomnoml') {
          return `<div class="diagram-container" data-diagram="nomnoml" data-source="${encodeURIComponent(text)}"><pre class="nomnoml-pending">${escapeHtml(text)}</pre></div>`;
        }

        // Default: render with language class for highlight.js
        const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
        return `<pre><code${langClass}>${escapeHtml(text)}</code></pre>\n`;
      },

      // GitHub-style alerts via blockquote renderer
      blockquote(this: any, { tokens }: { tokens: any[] }): string {
        // Parse inner tokens to HTML using the parser
        const body = this.parser.parse(tokens);
        const alertMatch = body.match(/^\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i);
        if (alertMatch) {
          const type = alertMatch[1].toLowerCase();
          const icon = ALERT_ICONS[type] || '';
          const content = body.replace(alertMatch[0], '<p>');
          return `<div class="alert alert-${type}"><div class="alert-title">${icon} ${type.charAt(0).toUpperCase() + type.slice(1)}</div>${content}</div>`;
        }
        return `<blockquote>\n${body}</blockquote>\n`;
      },
    },
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')        // strip HTML tags
    .replace(/&[^;]+;/g, '')        // strip HTML entities
    .replace(/[^\w\s-]/g, '')       // remove non-word chars
    .replace(/\s+/g, '-')           // spaces to hyphens
    .replace(/-+/g, '-')            // collapse multiple hyphens
    .replace(/^-|-$/g, '');         // trim leading/trailing hyphens
}

function processEmojis(html: string): string {
  return html.replace(/:([a-zA-Z0-9_+-]+):/g, (match, name) => EMOJI_MAP[name] || match);
}

function processMath(html: string): string {
  if (!katexModule) return html;

  // Block math: $$...$$
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    try {
      return `<div class="math-block">${katexModule!.default.renderToString(tex.trim(), { displayMode: true, throwOnError: false })}</div>`;
    } catch { return `<div class="math-block"><code>${escapeHtml(tex)}</code></div>`; }
  });

  // Inline math: $...$
  html = html.replace(/\$([^\$\n]+?)\$/g, (_, tex) => {
    try {
      return `<span class="math-inline">${katexModule!.default.renderToString(tex.trim(), { displayMode: false, throwOnError: false })}</span>`;
    } catch { return `<code>${escapeHtml(tex)}</code>`; }
  });

  return html;
}

async function loadHighlightJS(): Promise<void> {
  if (highlightModule) return;
  highlightModule = await import('highlight.js');
}

async function loadKaTeX(): Promise<void> {
  if (katexModule) return;
  katexModule = await import('katex');
  // Load KaTeX CSS
  if (!document.querySelector('link[href*="katex"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
    document.head.appendChild(link);
  }
}

async function loadMermaid(): Promise<void> {
  if (mermaidModule) return;
  mermaidModule = await import('mermaid');
  const themeType = document.documentElement.getAttribute('data-theme-type');
  mermaidModule.default.initialize({
    startOnLoad: false,
    theme: themeType === 'dark' ? 'dark' : 'default',
    securityLevel: 'loose',
  });
  mermaidReady = true;
}

async function renderMermaidDiagrams(): Promise<void> {
  if (!contentEl) return;
  const containers = contentEl.querySelectorAll('.diagram-container[data-diagram="mermaid"]');
  if (containers.length === 0) return;

  await loadMermaid();
  if (!mermaidReady || !mermaidModule) return;

  for (const container of containers) {
    const pre = container.querySelector('pre.mermaid');
    if (!pre || container.querySelector('svg')) continue;

    try {
      const source = decodeURIComponent((container as HTMLElement).dataset.source || '');
      const id = `mermaid-${crypto.randomUUID().slice(0, 8)}`;
      const { svg } = await mermaidModule.default.render(id, source);
      pre.innerHTML = svg;
      pre.classList.remove('mermaid');
      pre.classList.add('mermaid-rendered');
      addDiagramToolbar(container as HTMLElement, source);
    } catch (err) {
      pre.textContent = `Mermaid error: ${err}`;
      pre.classList.add('diagram-error');
    }
  }
}

async function renderGraphvizDiagrams(): Promise<void> {
  if (!contentEl) return;
  const containers = contentEl.querySelectorAll('.diagram-container[data-diagram="graphviz"]');
  if (containers.length === 0) return;

  try {
    const { instance } = await import('@viz-js/viz');
    const viz = await instance();

    for (const container of containers) {
      const pre = container.querySelector('pre.graphviz-pending');
      if (!pre) continue;
      const source = decodeURIComponent((container as HTMLElement).dataset.source || '');
      try {
        const svg = viz.renderSVGElement(source);
        pre.innerHTML = '';
        pre.appendChild(svg);
        pre.classList.remove('graphviz-pending');
        pre.classList.add('graphviz-rendered');
        addDiagramToolbar(container as HTMLElement, source);
      } catch (err) {
        pre.textContent = `Graphviz error: ${err}`;
        pre.classList.add('diagram-error');
      }
    }
  } catch {
    // viz.js not available
  }
}

async function renderNomnomlDiagrams(): Promise<void> {
  if (!contentEl) return;
  const containers = contentEl.querySelectorAll('.diagram-container[data-diagram="nomnoml"]');
  if (containers.length === 0) return;

  try {
    const nomnoml = await import('nomnoml');

    for (const container of containers) {
      const pre = container.querySelector('pre.nomnoml-pending');
      if (!pre) continue;
      const source = decodeURIComponent((container as HTMLElement).dataset.source || '');
      try {
        const svg = nomnoml.renderSvg(source);
        pre.innerHTML = svg;
        pre.classList.remove('nomnoml-pending');
        pre.classList.add('nomnoml-rendered');
        addDiagramToolbar(container as HTMLElement, source);
      } catch (err) {
        pre.textContent = `Nomnoml error: ${err}`;
        pre.classList.add('diagram-error');
      }
    }
  } catch {
    // nomnoml not available
  }
}

function addDiagramToolbar(container: HTMLElement, source: string): void {
  if (container.querySelector('.diagram-toolbar')) return;

  const toolbar = document.createElement('div');
  toolbar.className = 'diagram-toolbar';

  // ── Edit button (Confluence-style inline edit panel) ──
  const editBtn = document.createElement('button');
  editBtn.textContent = '✏️ Edit';
  editBtn.title = 'Edit diagram inline';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const rawType = (container.dataset.diagram ?? 'mermaid') as string;
    const diagramType: DiagramType = isValidDiagramType(rawType) ? rawType : 'mermaid';
    const encodedSource = container.dataset.source ?? '';
    const decodedSource = decodeURIComponent(encodedSource);

    openDiagramEditPanel({
      container,
      type: diagramType,
      source: decodedSource,
      encodedSource,
      onApply: (newFence, oldEncoded) => {
        const tab = getActiveTab();
        if (!tab) return;
        const updated = applyDiagramEdit(tab.content, oldEncoded, newFence);
        updateTabContent(tab.id, updated);
        emit('set-editor-content', updated);
      },
    });
  });

  const zoomBtn = document.createElement('button');
  zoomBtn.textContent = '🔍 Zoom';
  zoomBtn.title = 'Open in zoom modal';
  zoomBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const svg = container.querySelector('svg');
    if (svg) emit('open-diagram-zoom', { svg: svg.outerHTML, source });
  });

  const pngBtn = document.createElement('button');
  pngBtn.textContent = 'PNG';
  pngBtn.title = 'Download as PNG';
  pngBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const svg = container.querySelector('svg');
    if (svg) downloadDiagramAsPNG(svg, 'diagram');
  });

  const svgBtn = document.createElement('button');
  svgBtn.textContent = 'SVG';
  svgBtn.title = 'Download as SVG';
  svgBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const svg = container.querySelector('svg');
    if (svg) downloadDiagramAsSVG(svg, 'diagram');
  });

  toolbar.append(editBtn, zoomBtn, pngBtn, svgBtn);
  container.appendChild(toolbar);
}

function downloadDiagramAsPNG(svg: SVGElement, name: string): void {
  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const img = new Image();
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  img.onload = () => {
    canvas.width = img.naturalWidth * 2;
    canvas.height = img.naturalHeight * 2;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `${name}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  };
  img.src = url;
}

function downloadDiagramAsSVG(svg: SVGElement, name: string): void {
  const svgData = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.svg`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function highlightCodeBlocks(): Promise<void> {
  if (!contentEl) return;
  const blocks = contentEl.querySelectorAll('pre code[class*="language-"]');
  if (blocks.length === 0) return;

  await loadHighlightJS();
  if (!highlightModule) return;

  blocks.forEach((block) => {
    if (!(block as HTMLElement).dataset.highlighted) {
      highlightModule!.default.highlightElement(block as HTMLElement);
      (block as HTMLElement).dataset.highlighted = 'true';
    }
  });
}

async function renderContent(mdContent: string): Promise<void> {
  if (!contentEl) return;

  // Reset heading slug counts for each render
  headingSlugCounts.clear();

  let html: string;
  try {
    html = await marked.parse(mdContent);
  } catch (err) {
    console.warn('Markdown parse error, attempting recovery:', err);
    try {
      // Fallback: parse with minimal options
      html = await marked.parse(mdContent, { gfm: true, breaks: false });
    } catch {
      html = `<pre>${escapeHtml(mdContent)}</pre>`;
    }
  }

  html = processEmojis(html);

  // Load KaTeX if math is present
  if (mdContent.includes('$')) {
    await loadKaTeX();
    html = processMath(html);
  }

  html = DOMPurify.sanitize(html, {
    ADD_TAGS: ['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'text', 'g', 'defs', 'marker', 'foreignObject', 'style', 'clipPath', 'use', 'image', 'pattern', 'linearGradient', 'radialGradient', 'stop', 'tspan', 'desc', 'title', 'ellipse'],
    ADD_ATTR: ['viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'd', 'transform', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'points', 'rx', 'ry', 'text-anchor', 'dominant-baseline', 'font-size', 'font-family', 'font-weight', 'class', 'id', 'marker-end', 'marker-start', 'clip-path', 'href', 'xlink:href', 'style', 'data-diagram', 'data-source', 'data-highlighted', 'role', 'aria-roledescription', 'aria-label', 'tabindex', 'data-id', 'data-node-id'],
    ALLOW_UNKNOWN_PROTOCOLS: true,
  });

  // Save scroll before replacing HTML so we can restore after render
  const savedScroll = contentEl.scrollTop;

  contentEl.innerHTML = html;

  // Restore scroll position immediately so the viewport doesn't jump
  if (savedScroll > 0) contentEl.scrollTop = savedScroll;

  // Protect diagrams, math, and code blocks from WYSIWYG editing
  protectNonEditableElements();

  // Post-render: diagrams and syntax highlighting (async, non-blocking)
  requestAnimationFrame(() => {
    highlightCodeBlocks();
    renderMermaidDiagrams().then(protectNonEditableElements);
    renderGraphvizDiagrams().then(protectNonEditableElements);
    renderNomnomlDiagrams().then(protectNonEditableElements);
  });
}

function scheduleRender(): void {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    const tab = getActiveTab();
    if (tab) renderContent(tab.content);
  }, RENDER_DELAY);
}

function protectNonEditableElements(): void {
  if (!contentEl) return;
  const selectors = '.diagram-container, .math-block, .math-inline, pre';
  contentEl.querySelectorAll(selectors).forEach(el => {
    (el as HTMLElement).setAttribute('contenteditable', 'false');
  });
}

export function setPreviewEditable(editable: boolean): void {
  previewEditable = editable;
  if (contentEl) {
    contentEl.setAttribute('contenteditable', editable ? 'true' : 'false');
    contentEl.classList.toggle('preview-editable', editable);
    if (editable) protectNonEditableElements();
  }
  emit('preview-mode-changed', editable);
}

export function isPreviewEditable(): boolean {
  return previewEditable;
}

export function createPreview(): HTMLElement {
  previewEl = document.createElement('div');
  previewEl.className = 'preview-pane';
  previewEl.id = 'preview-pane';

  contentEl = document.createElement('div');
  contentEl.className = 'preview-content markdown-body';
  contentEl.setAttribute('contenteditable', 'false');
  previewEl.appendChild(contentEl);

  // ── /draw FAB — insert a new diagram from the preview pane ────────────────
  const drawFab = document.createElement('button');
  drawFab.className = 'preview-draw-fab';
  drawFab.title = 'Insert a diagram (/draw)';
  drawFab.innerHTML = '📊 /draw';
  drawFab.setAttribute('aria-label', 'Insert diagram');
  drawFab.addEventListener('click', (e) => {
    e.stopPropagation();
    openDiagramInsertPanel(previewEl, (fence) => {
      const tab = getActiveTab();
      if (!tab) return;
      const updated = tab.content.trimEnd() + '\n\n' + fence + '\n';
      updateTabContent(tab.id, updated);
      emit('set-editor-content', updated);
    });
  });
  previewEl.appendChild(drawFab);

  configureMarked();

  // WYSIWYG: convert HTML edits back to markdown (only in edit mode)
  let wysiwygTimer: ReturnType<typeof setTimeout> | null = null;
  let ignoreNextRender = false;
  contentEl.addEventListener('input', () => {
    if (!previewEditable) return;
    if (wysiwygTimer) clearTimeout(wysiwygTimer);
    wysiwygTimer = setTimeout(() => {
      const tab = getActiveTab();
      if (!tab) return;
      const md = htmlToMarkdown(contentEl.innerHTML);
      ignoreNextRender = true;
      updateTabContent(tab.id, md);
      emit('set-editor-content', md);
    }, 400);
  });

  // Handle anchor link clicks for TOC navigation
  contentEl.addEventListener('click', (e) => {
    const anchor = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null;
    if (!anchor) return;
    e.preventDefault();
    const targetId = decodeURIComponent(anchor.getAttribute('href')!.slice(1));
    const target = contentEl.querySelector(`[id="${CSS.escape(targetId)}"]`) as HTMLElement
      || contentEl.querySelector(`[id="${targetId}"]`) as HTMLElement;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Bidirectional scroll sync
  let ignorePreviewScroll = false;
  contentEl.addEventListener('scroll', () => {
    const tab = getActiveTab();
    if (tab) setPreviewScroll(tab.id, contentEl.scrollTop);
    if (!getState().syncScroll || ignorePreviewScroll) return;
    const scrollHeight = contentEl.scrollHeight - contentEl.clientHeight;
    if (scrollHeight > 0) {
      emit('preview-scroll', contentEl.scrollTop / scrollHeight);
    }
  });

  on('editor-scroll', (ratio: unknown) => {
    if (!getState().syncScroll) return;
    ignorePreviewScroll = true;
    const r = ratio as number;
    contentEl.scrollTop = r * (contentEl.scrollHeight - contentEl.clientHeight);
    requestAnimationFrame(() => { ignorePreviewScroll = false; });
  });

  // Render on content change (skip if WYSIWYG was the source)
  on('content-changed', () => {
    if (ignoreNextRender) { ignoreNextRender = false; return; }
    scheduleRender();
  });
  on('active-tab-changed', () => {
    ignoreNextRender = false;
    const tab = getActiveTab();
    if (tab && contentEl) {
      // Schedule render then restore saved scroll position once the DOM settles
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(async () => {
        if (tab) {
          await renderContent(tab.content);
          // Restore scroll after render completes
          requestAnimationFrame(() => {
            if (contentEl && tab) contentEl.scrollTop = tab.scrollPreview ?? 0;
          });
        }
      }, RENDER_DELAY);
    } else {
      scheduleRender();
    }
  });
  on('state-restored', () => { ignoreNextRender = false; scheduleRender(); });

  // Re-init mermaid on theme change
  on('theme-changed', () => {
    if (mermaidModule && mermaidReady) {
      const themeType = document.documentElement.getAttribute('data-theme-type');
      mermaidModule.default.initialize({
        startOnLoad: false,
        theme: themeType === 'dark' ? 'dark' : 'default',
        securityLevel: 'loose',
      });
    }
    scheduleRender();
  });

  // Initial render
  const tab = getActiveTab();
  if (tab) renderContent(tab.content);

  return previewEl;
}

export function getPreviewElement(): HTMLElement {
  return contentEl;
}
