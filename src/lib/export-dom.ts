/** Off-screen DOM helpers so exports capture full scroll height (not just the viewport). */

const EXPORT_WIDTH_PX = 794; // ~A4 width at 96dpi
/** Soft canvas height cap (device px) — browsers often fail past ~16k. */
export const MAX_CANVAS_PX = 8192;

export type PreparedExportRoot = {
  wrapper: HTMLElement;
  content: HTMLElement;
  dispose: () => void;
};

/** Wait briefly for pending diagram renders in the live preview. */
export async function waitForPreviewDiagrams(
  root: HTMLElement,
  timeoutMs = 4000,
): Promise<void> {
  const pending = () =>
    root.querySelector(
      '.graphviz-pending, .nomnoml-pending, pre.mermaid:not(.mermaid-rendered)',
    );

  if (!pending()) return;

  const start = Date.now();
  while (pending() && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Clone preview into a fixed off-screen full-height host so html2canvas /
 * Word HTML see the entire document (preview uses overflow-y: auto).
 */
export function prepareExportRoot(source: HTMLElement): PreparedExportRoot {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-export-root', 'true');
  wrapper.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    `width:${EXPORT_WIDTH_PX}px`,
    'height:auto',
    'overflow:visible',
    'background:#ffffff',
    'color:#1f2937',
    'z-index:-1',
    'pointer-events:none',
  ].join(';');

  const content = source.cloneNode(true) as HTMLElement;
  content.removeAttribute('contenteditable');
  content.style.height = 'auto';
  content.style.maxHeight = 'none';
  content.style.overflow = 'visible';
  content.style.padding = '24px 32px';
  content.style.background = '#ffffff';
  content.style.color = '#1f2937';
  content.style.boxSizing = 'border-box';
  content.style.width = '100%';

  // Strip interactive chrome that should not appear in exports
  content.querySelectorAll(
    '.diagram-toolbar, .preview-draw-fab, button, [contenteditable]',
  ).forEach((el) => el.remove());

  // Neutralize theme-dependent dark backgrounds for print
  content.querySelectorAll('pre, code').forEach((node) => {
    const el = node as HTMLElement;
    el.style.background = '#f6f8fa';
    el.style.color = '#1f2937';
  });

  wrapper.appendChild(content);
  document.body.appendChild(wrapper);

  return {
    wrapper,
    content,
    dispose: () => {
      wrapper.remove();
    },
  };
}

/** Replace inline SVGs with PNG <img> so Word / html-docx can embed them. */
export async function replaceSvgsWithPngImages(root: HTMLElement): Promise<void> {
  const svgs = Array.from(root.querySelectorAll('svg'));
  for (const svg of svgs) {
    try {
      const dataUrl = await svgElementToPngDataUrl(svg);
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = svg.getAttribute('aria-label') || 'diagram';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      svg.replaceWith(img);
    } catch {
      // Leave SVG in place if rasterization fails (HTML export still OK)
    }
  }
}

export async function svgElementToPngDataUrl(svg: SVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGElement;
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  const bbox = (() => {
    try {
      return svg.getBoundingClientRect();
    } catch {
      return { width: 0, height: 0 };
    }
  })();

  let width = Math.ceil(bbox.width || Number(svg.getAttribute('width')) || 0);
  let height = Math.ceil(bbox.height || Number(svg.getAttribute('height')) || 0);

  if (!width || !height) {
    const viewBox = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
    if (viewBox && viewBox.length === 4) {
      width = Math.ceil(viewBox[2]) || 400;
      height = Math.ceil(viewBox[3]) || 300;
    } else {
      width = width || 400;
      height = height || 300;
    }
  }

  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const xml = new XMLSerializer().serializeToString(clone);
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('SVG image load failed'));
    img.src = svgUrl;
  });

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = Math.max(1, width * scale);
  canvas.height = Math.max(1, height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unsupported');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export function buildStandaloneHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1f2937; }
    pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; }
    code { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 85%; }
    table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #d1d5db; padding: 6px 13px; }
    blockquote { border-left: 4px solid #d1d5db; margin: 0; padding: 0 1em; color: #6b7280; }
    img { max-width: 100%; height: auto; }
    ul, ol { padding-left: 1.5em; }
    li { margin: 0.25em 0; }
    h1, h2 { border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

export function buildDocxHtml(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body { font-family: 'Calibri', sans-serif; font-size: 11pt; line-height: 1.5; color: #1f2937; }
  h1 { font-size: 20pt; } h2 { font-size: 16pt; } h3 { font-size: 14pt; }
  pre { background: #f6f8fa; padding: 8px; font-family: Consolas, monospace; font-size: 10pt; white-space: pre-wrap; }
  code { font-family: Consolas, monospace; font-size: 10pt; }
  table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #999; padding: 4px 8px; }
  blockquote { border-left: 3px solid #ccc; margin: 0; padding: 0 12px; color: #555; }
  img { max-width: 600px; height: auto; }
  ul, ol { margin: 0 0 12px 24px; }
  li { margin: 4px 0; }
</style></head><body>${bodyHtml}</body></html>`;
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Split a tall canvas into vertical slices under MAX_CANVAS_PX so PDF export
 * does not hit browser canvas limits on long documents.
 */
export function sliceCanvasVertically(
  source: HTMLCanvasElement,
  maxHeightPx = MAX_CANVAS_PX,
): HTMLCanvasElement[] {
  if (source.height <= maxHeightPx) return [source];

  const slices: HTMLCanvasElement[] = [];
  let y = 0;
  while (y < source.height) {
    const h = Math.min(maxHeightPx, source.height - y);
    const slice = document.createElement('canvas');
    slice.width = source.width;
    slice.height = h;
    const ctx = slice.getContext('2d');
    if (!ctx) throw new Error('Canvas unsupported');
    ctx.drawImage(source, 0, y, source.width, h, 0, 0, source.width, h);
    slices.push(slice);
    y += h;
  }
  return slices;
}

/** Paint canvas slices into a jsPDF instance with A4 page breaks. */
export function addCanvasSlicesToPdf(
  pdf: {
    internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
    addPage: () => void;
    addImage: (
      imageData: string,
      format: string,
      x: number,
      y: number,
      w: number,
      h: number,
    ) => void;
  },
  slices: HTMLCanvasElement[],
): void {
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();
  let first = true;

  for (const slice of slices) {
    const imgData = slice.toDataURL('image/png');
    const imgW = slice.width;
    const imgH = slice.height;
    const ratio = pdfW / imgW;
    const sliceHMm = imgH * ratio;

    let offsetMm = 0;
    while (offsetMm < sliceHMm) {
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(imgData, 'PNG', 0, -offsetMm, pdfW, sliceHMm);
      offsetMm += pdfH;
    }
  }
}
