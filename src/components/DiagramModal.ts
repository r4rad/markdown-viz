import { on } from '../lib/events';

interface ZoomData {
  svg: string;
  source: string;
}

let modal: HTMLElement | null = null;
let scale = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let startX = 0;
let startY = 0;

export function initDiagramModal(): void {
  on('open-diagram-zoom', (data: unknown) => {
    openModal(data as ZoomData);
  });
}

function openModal(data: ZoomData): void {
  if (modal) closeModal();

  scale = 1;
  panX = 0;
  panY = 0;

  modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="width:90vw;height:90vh;">
      <div class="modal-header">
        <span class="modal-title">Diagram Zoom</span>
        <div style="display:flex;gap:4px;align-items:center;">
          <button class="toolbar-btn" data-zm="png" title="Download PNG">PNG</button>
          <button class="toolbar-btn" data-zm="svg" title="Download SVG">SVG</button>
          <button class="modal-close" title="Close (Esc)">×</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="zoom-viewport" id="zoom-viewport">
          <div class="zoom-content" id="zoom-content">${data.svg}</div>
        </div>
      </div>
      <div class="zoom-controls">
        <button data-zm="in" title="Zoom in">+ Zoom In</button>
        <button data-zm="out" title="Zoom out">− Zoom Out</button>
        <button data-zm="fit" title="Fit to view">Fit</button>
        <button data-zm="reset" title="Reset">Reset</button>
        <span class="zoom-level" id="zoom-level">100%</span>
        <div style="flex:1"></div>
        <span style="font-size:11px;color:var(--text-muted)">Scroll to zoom • Drag to pan</span>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const viewport = modal.querySelector('#zoom-viewport')!;
  const content = modal.querySelector('#zoom-content') as HTMLElement;

  // Mouse wheel zoom
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const we = e as WheelEvent;
    const delta = we.deltaY > 0 ? -0.1 : 0.1;
    scale = Math.max(0.1, Math.min(10, scale + delta));
    updateTransform(content);
  }, { passive: false });

  // Pan with drag
  viewport.addEventListener('mousedown', (e) => {
    isPanning = true;
    startX = (e as MouseEvent).clientX - panX;
    startY = (e as MouseEvent).clientY - panY;
  });

  viewport.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    panX = (e as MouseEvent).clientX - startX;
    panY = (e as MouseEvent).clientY - startY;
    updateTransform(content);
  });

  viewport.addEventListener('mouseup', () => { isPanning = false; });
  viewport.addEventListener('mouseleave', () => { isPanning = false; });

  // Touch support
  let lastTouchDist = 0;
  viewport.addEventListener('touchstart', (e) => {
    const te = e as TouchEvent;
    if (te.touches.length === 1) {
      isPanning = true;
      startX = te.touches[0].clientX - panX;
      startY = te.touches[0].clientY - panY;
    } else if (te.touches.length === 2) {
      lastTouchDist = Math.hypot(
        te.touches[0].clientX - te.touches[1].clientX,
        te.touches[0].clientY - te.touches[1].clientY
      );
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    const te = e as TouchEvent;
    if (te.touches.length === 1 && isPanning) {
      panX = te.touches[0].clientX - startX;
      panY = te.touches[0].clientY - startY;
      updateTransform(content);
    } else if (te.touches.length === 2) {
      const dist = Math.hypot(
        te.touches[0].clientX - te.touches[1].clientX,
        te.touches[0].clientY - te.touches[1].clientY
      );
      if (lastTouchDist > 0) {
        scale = Math.max(0.1, Math.min(10, scale * (dist / lastTouchDist)));
        updateTransform(content);
      }
      lastTouchDist = dist;
    }
  }, { passive: true });

  viewport.addEventListener('touchend', () => { isPanning = false; lastTouchDist = 0; });

  // Button controls
  modal.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-zm]') as HTMLElement | null;
    if (!btn) {
      if ((e.target as HTMLElement).classList.contains('modal-close') || (e.target as HTMLElement).classList.contains('modal-overlay')) {
        closeModal();
      }
      return;
    }
    switch (btn.dataset.zm) {
      case 'in': scale = Math.min(10, scale + 0.25); updateTransform(content); break;
      case 'out': scale = Math.max(0.1, scale - 0.25); updateTransform(content); break;
      case 'reset': scale = 1; panX = 0; panY = 0; updateTransform(content); break;
      case 'fit': fitToView(content, viewport as HTMLElement); break;
      case 'png': downloadPNG(content); break;
      case 'svg': downloadSVG(content); break;
    }
  });

  // Esc to close
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', keyHandler); }
  };
  document.addEventListener('keydown', keyHandler);

  // Fit on open
  requestAnimationFrame(() => fitToView(content, viewport as HTMLElement));
}

function updateTransform(content: HTMLElement): void {
  content.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  const levelEl = document.getElementById('zoom-level');
  if (levelEl) levelEl.textContent = `${Math.round(scale * 100)}%`;
}

function fitToView(content: HTMLElement, viewport: HTMLElement): void {
  const svg = content.querySelector('svg');
  if (!svg) return;
  const vw = viewport.clientWidth - 40;
  const vh = viewport.clientHeight - 40;
  const sw = svg.getBoundingClientRect().width / scale;
  const sh = svg.getBoundingClientRect().height / scale;
  if (sw <= 0 || sh <= 0) return;
  scale = Math.min(vw / sw, vh / sh, 3);
  panX = 0;
  panY = 0;
  updateTransform(content);
}

function downloadPNG(content: HTMLElement): void {
  const svg = content.querySelector('svg');
  if (!svg) return;
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
      a.download = 'diagram.png';
      a.click();
      URL.revokeObjectURL(a.href);
    }, 'image/png');
  };
  img.src = url;
}

function downloadSVG(content: HTMLElement): void {
  const svg = content.querySelector('svg');
  if (!svg) return;
  const svgData = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'diagram.svg';
  a.click();
  URL.revokeObjectURL(a.href);
}

function closeModal(): void {
  if (modal) {
    modal.remove();
    modal = null;
  }
}
