import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/state', () => ({
  getActiveTab: vi.fn(() => ({
    id: 'test-tab',
    name: 'test.md',
    content: '# Hello',
    cursorPos: 0,
    scrollTop: 0,
    scrollPreview: 0,
    dirty: false,
    updatedAt: Date.now(),
    createdAt: Date.now(),
  })),
  getState: vi.fn(() => ({
    tabs: [],
    activeTabId: 'test-tab',
    theme: 'github-dark',
    syncScroll: true,
    showPreview: true,
    showEditor: true,
    sidebarOpen: false,
  })),
  updateTabContent: vi.fn(),
  setPreviewScroll: vi.fn(),
}));

vi.mock('../src/components/Preview', () => {
  const el = document.createElement('div');
  el.innerHTML = '<h1>Hello</h1><p>World</p>';
  return {
    getPreviewElement: () => el,
    setPreviewEditable: vi.fn(),
    isPreviewEditable: vi.fn(() => false),
  };
});

vi.mock('html-docx-js-typescript', () => ({
  asBlob: vi.fn(async () => new Blob(['docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })),
}));

describe('Export DOCX', () => {
  beforeEach(() => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('should export exportDOCX function', async () => {
    const mod = await import('../src/lib/export');
    expect(mod.exportDOCX).toBeTypeOf('function');
  });

  it('should not throw when called with valid state', async () => {
    const { exportDOCX } = await import('../src/lib/export');
    await expect(exportDOCX()).resolves.toBeUndefined();
  });
});
