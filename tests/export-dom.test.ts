import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  addCanvasSlicesToPdf,
  buildDocxHtml,
  buildStandaloneHtml,
  MAX_CANVAS_PX,
  prepareExportRoot,
  sliceCanvasVertically,
} from '../src/lib/export-dom';

function stubCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = {
    width,
    height,
    getContext: vi.fn(() => ({
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    })),
    toDataURL: vi.fn(() => 'data:image/png;base64,AAA'),
  };
  return canvas as unknown as HTMLCanvasElement;
}

describe('export-dom', () => {
  let source: HTMLElement;

  beforeEach(() => {
    source = document.createElement('div');
    source.className = 'preview-content markdown-body';
    source.style.height = '100px';
    source.style.overflow = 'auto';
    source.innerHTML = `
      <h1>Title</h1>
      <ul><li>Alpha</li><li>Beta</li></ul>
      <pre><code class="language-js">const x = 1;</code></pre>
      <div class="diagram-toolbar"><button>Edit</button></div>
      <p>${'Long paragraph. '.repeat(40)}</p>
    `;
    document.body.appendChild(source);
  });

  afterEach(() => {
    source.remove();
    document.querySelectorAll('[data-export-root]').forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  it('prepareExportRoot expands height and strips chrome', () => {
    const prepared = prepareExportRoot(source);
    expect(prepared.content.style.height).toBe('auto');
    expect(prepared.content.style.overflow).toBe('visible');
    expect(prepared.content.querySelector('.diagram-toolbar')).toBeNull();
    expect(prepared.content.querySelector('button')).toBeNull();
    expect(prepared.content.querySelector('h1')?.textContent).toBe('Title');
    prepared.dispose();
    expect(document.querySelector('[data-export-root]')).toBeNull();
  });

  it('buildStandaloneHtml and buildDocxHtml wrap body content', () => {
    const body = '<h1>Hi</h1><ul><li>one</li></ul>';
    expect(buildStandaloneHtml('Doc', body)).toContain('<h1>Hi</h1>');
    expect(buildStandaloneHtml('Doc', body)).toContain('<title>Doc</title>');
    expect(buildDocxHtml(body)).toContain('Calibri');
    expect(buildDocxHtml(body)).toContain('<li>one</li>');
  });

  it('sliceCanvasVertically splits tall canvases under the cap', () => {
    const canvas = stubCanvas(100, MAX_CANVAS_PX + 500);
    const created: HTMLCanvasElement[] = [];
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') {
        const slice = stubCanvas(1, 1);
        created.push(slice);
        return slice;
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    }) as typeof document.createElement);

    const slices = sliceCanvasVertically(canvas);
    expect(slices.length).toBe(2);
    expect(slices[0].height).toBe(MAX_CANVAS_PX);
    expect(slices[1].height).toBe(500);
    expect(created).toHaveLength(2);
  });

  it('addCanvasSlicesToPdf creates multiple pages for tall content', () => {
    const canvas = stubCanvas(100, 2000);
    const pages: string[] = [];
    const pdf = {
      internal: {
        pageSize: {
          getWidth: () => 210,
          getHeight: () => 50,
        },
      },
      addPage: () => pages.push('page'),
      addImage: () => {},
    };

    addCanvasSlicesToPdf(pdf, [canvas]);
    expect(pages.length).toBeGreaterThan(0);
  });
});
