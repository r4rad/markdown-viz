import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { getActiveTab, getState, setPreviewScroll } from '../lib/state';
import { on, emit } from '../lib/events';

let previewEl: HTMLElement;
let contentEl: HTMLElement;
let renderTimer: ReturnType<typeof setTimeout> | null = null;
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

function configureMarked(): void {
  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  const renderer = new marked.Renderer();

  // Custom code block renderer for diagrams
  const origCode = renderer.code.bind(renderer);
  renderer.code = function (token: any): string {
    const text: string = token.text ?? '';
    const lang: string = token.lang ?? '';
    const language = lang.toLowerCase().trim();

    if (language === 'mermaid') {
      return `<div class="diagram-container" data-diagram="mermaid" data-source="${encodeURIComponent(text)}"><pre class="mermaid">${escapeHtml(text)}</pre></div>`;
    }

    if (language === 'dot' || language === 'graphviz') {
      return `<div class="diagram-container" data-diagram="graphviz" data-source="${encodeURIComponent(text)}"><pre class="graphviz-pending">${escapeHtml(text)}</pre></div>`;
    }

    if (language === 'nomnoml') {
      return `<div class="diagram-container" data-diagram="nomnoml" data-source="${encodeURIComponent(text)}"><pre class="nomnoml-pending">${escapeHtml(text)}</pre></div>`;
    }

    return origCode.call(this, token);
  };

  // GitHub-style alerts
  const origBlockquote = renderer.blockquote.bind(renderer);
  renderer.blockquote = function (token: any): string {
    const text: string = typeof token === 'string' ? token : (token.text ?? token.body ?? '');
    const alertMatch = text.match(/^\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i);
    if (alertMatch) {
      const type = alertMatch[1].toLowerCase();
      const icons: Record<string, string> = {
        note: 'ℹ️', tip: '💡', important: '🔮', warning: '⚠️', caution: '🔴',
      };
      const content = text.replace(alertMatch[0], '<p>');
      return `<div class="alert alert-${type}"><div class="alert-title">${icons[type] || ''} ${type.charAt(0).toUpperCase() + type.slice(1)}</div>${content}</div>`;
    }
    return origBlockquote.call(this, token);
  };

  marked.use({ renderer });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  toolbar.append(zoomBtn, pngBtn, svgBtn);
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

  let html = await marked.parse(mdContent);
  html = processEmojis(html);

  // Load KaTeX if math is present
  if (mdContent.includes('$')) {
    await loadKaTeX();
    html = processMath(html);
  }

  html = DOMPurify.sanitize(html, {
    ADD_TAGS: ['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'text', 'g', 'defs', 'marker', 'foreignObject', 'style', 'clipPath', 'use', 'image', 'pattern', 'linearGradient', 'radialGradient', 'stop', 'tspan', 'desc', 'title'],
    ADD_ATTR: ['viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'd', 'transform', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'points', 'rx', 'ry', 'text-anchor', 'dominant-baseline', 'font-size', 'font-family', 'font-weight', 'class', 'id', 'marker-end', 'marker-start', 'clip-path', 'href', 'xlink:href', 'style', 'data-diagram', 'data-source', 'data-highlighted'],
    ALLOW_UNKNOWN_PROTOCOLS: true,
  });

  contentEl.innerHTML = html;

  // Post-render: diagrams and syntax highlighting (async, non-blocking)
  requestAnimationFrame(() => {
    highlightCodeBlocks();
    renderMermaidDiagrams();
    renderGraphvizDiagrams();
    renderNomnomlDiagrams();
  });
}

function scheduleRender(): void {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    const tab = getActiveTab();
    if (tab) renderContent(tab.content);
  }, RENDER_DELAY);
}

export function createPreview(): HTMLElement {
  previewEl = document.createElement('div');
  previewEl.className = 'preview-pane';
  previewEl.id = 'preview-pane';

  contentEl = document.createElement('div');
  contentEl.className = 'preview-content markdown-body';
  previewEl.appendChild(contentEl);

  configureMarked();

  // Handle scroll sync from editor
  contentEl.addEventListener('scroll', () => {
    const tab = getActiveTab();
    if (tab) setPreviewScroll(tab.id, contentEl.scrollTop);
  });

  on('editor-scroll', (ratio: unknown) => {
    if (!getState().syncScroll) return;
    const r = ratio as number;
    contentEl.scrollTop = r * (contentEl.scrollHeight - contentEl.clientHeight);
  });

  // Render on content change
  on('content-changed', () => scheduleRender());
  on('active-tab-changed', () => scheduleRender());
  on('state-restored', () => scheduleRender());

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
