import { describe, it, expect, vi, beforeEach } from 'vitest';
import { on, emit } from '../src/lib/events';
import {
  getState, getActiveTab, addTab, closeTab, switchTab,
  updateTabContent, updateTabName, setTheme,
  toggleEditor, togglePreview, toggleSyncScroll, restoreState,
} from '../src/lib/state';
import { htmlToMarkdown } from '../src/lib/html-to-markdown';
import { isSharingEnabled, getShareIdFromURL, buildShareURL } from '../src/lib/share';
import { icon } from '../src/components/icons';

/**
 * End-to-end integration tests that verify feature flows across modules.
 */

describe('E2E: Share Flow', () => {
  it('sharing should be enabled by default', () => {
    expect(isSharingEnabled()).toBe(true);
  });

  it('share URL should round-trip through build and parse', () => {
    const docId = 'test-doc-123';
    const url = buildShareURL(docId);
    const parsed = getShareIdFromURL(url);
    expect(parsed).toBe(docId);
  });

  it('should not parse share ID from non-share URLs', () => {
    expect(getShareIdFromURL('https://example.com/')).toBeNull();
    expect(getShareIdFromURL('https://example.com/settings')).toBeNull();
    expect(getShareIdFromURL('https://example.com/shared')).toBeNull();
    expect(getShareIdFromURL('https://example.com/shared/')).toBeNull();
  });

  it('should handle special characters in doc IDs', () => {
    const docId = 'abc-123_XYZ';
    const url = buildShareURL(docId);
    expect(getShareIdFromURL(url)).toBe(docId);
  });

  it('share-request event should be emittable', () => {
    const cb = vi.fn();
    const unsub = on('share-request', cb);
    emit('share-request');
    expect(cb).toHaveBeenCalled();
    unsub();
  });

  it('share icon should exist in icon registry', () => {
    const html = icon('share');
    expect(html).toContain('svg');
    expect(html).toContain('circle');
  });
});

describe('E2E: WYSIWYG Editing Flow', () => {
  it('should convert simple HTML paragraph to markdown', () => {
    const md = htmlToMarkdown('<p>Hello World</p>');
    expect(md).toBe('Hello World');
  });

  it('should round-trip: markdown -> HTML concepts -> markdown', () => {
    // Simulate what happens: markdown is rendered to HTML,
    // user edits HTML, we convert back to markdown
    const html = '<h1>Title</h1><p>Paragraph with <strong>bold</strong> and <em>italic</em>.</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('# Title');
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
  });

  it('should handle complex nested structures', () => {
    const html = `
      <h2>Section</h2>
      <ul><li>Item 1</li><li>Item 2</li></ul>
      <blockquote>A quote</blockquote>
      <pre>code block</pre>
    `;
    const md = htmlToMarkdown(html);
    expect(md).toContain('## Section');
    expect(md).toContain('- Item 1');
    expect(md).toContain('- Item 2');
    expect(md).toContain('> ');
    expect(md).toContain('```');
  });

  it('should preserve table structures', () => {
    const html = '<table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('| Name | Value |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| A | 1 |');
  });

  it('set-editor-content event should propagate', () => {
    const cb = vi.fn();
    const unsub = on('set-editor-content', cb);
    emit('set-editor-content', '# New content');
    expect(cb).toHaveBeenCalledWith('# New content');
    unsub();
  });

  it('content-changed event should fire on updateTabContent', () => {
    const tab = addTab('wysiwyg-test.md', 'original');
    const cb = vi.fn();
    const unsub = on('content-changed', cb);
    updateTabContent(tab.id, 'modified from WYSIWYG');
    expect(cb).toHaveBeenCalledWith({ id: tab.id, content: 'modified from WYSIWYG' });
    unsub();
  });
});

describe('E2E: DOCX Export Flow', () => {
  it('export event with docx format should be emittable', () => {
    const cb = vi.fn();
    const unsub = on('export', cb);
    emit('export', 'docx');
    expect(cb).toHaveBeenCalledWith('docx');
    unsub();
  });

  it('export module should export the exportDOCX function', async () => {
    const mod = await import('../src/lib/export');
    expect(mod.exportDOCX).toBeTypeOf('function');
  });
});

describe('E2E: Sync Animation States', () => {
  let btn: HTMLElement;

  beforeEach(() => {
    btn = document.createElement('button');
    btn.id = 'cloud-sync-test-btn';
    document.body.appendChild(btn);
  });

  it('should simulate complete sync lifecycle', () => {
    // Start syncing
    btn.classList.add('syncing');
    expect(btn.classList.contains('syncing')).toBe(true);

    // Sync succeeds
    btn.classList.remove('syncing');
    btn.classList.add('sync-ok');
    expect(btn.classList.contains('sync-ok')).toBe(true);
    expect(btn.classList.contains('syncing')).toBe(false);

    // Cleanup after delay
    btn.classList.remove('sync-ok', 'sync-fail');
    expect(btn.classList.contains('sync-ok')).toBe(false);
  });

  it('should simulate sync failure lifecycle', () => {
    btn.classList.add('syncing');
    btn.classList.remove('syncing');
    btn.classList.add('sync-fail');
    expect(btn.classList.contains('sync-fail')).toBe(true);
    btn.classList.remove('sync-ok', 'sync-fail');
    expect(btn.classList.contains('sync-fail')).toBe(false);
  });

  it('cloud-sync-request event should be emittable', () => {
    const cb = vi.fn();
    const unsub = on('cloud-sync-request', cb);
    emit('cloud-sync-request');
    expect(cb).toHaveBeenCalled();
    unsub();
  });
});

describe('E2E: Full Tab Lifecycle', () => {
  it('should create, edit, rename, switch, and close tabs', () => {
    const t1 = addTab('e2e-1.md', '# E2E Test 1');
    const t2 = addTab('e2e-2.md', '# E2E Test 2');

    // Both tabs exist
    expect(getState().tabs.find(t => t.id === t1.id)).toBeDefined();
    expect(getState().tabs.find(t => t.id === t2.id)).toBeDefined();

    // Active should be t2 (last added)
    expect(getState().activeTabId).toBe(t2.id);

    // Switch and edit
    switchTab(t1.id);
    expect(getActiveTab()?.id).toBe(t1.id);
    updateTabContent(t1.id, '# Modified');
    expect(getState().tabs.find(t => t.id === t1.id)?.content).toBe('# Modified');

    // Rename
    updateTabName(t1.id, 'renamed.md');
    expect(getState().tabs.find(t => t.id === t1.id)?.name).toBe('renamed.md');

    // Close
    closeTab(t1.id);
    expect(getState().tabs.find(t => t.id === t1.id)).toBeUndefined();
  });
});

describe('E2E: Cloud-Sync Icon', () => {
  it('cloud-sync icon should contain cloud-body and vapor/drop elements markup', () => {
    const html = icon('cloud-sync');
    expect(html).toContain('cloud-body');
    expect(html).toContain('vapor');
    expect(html).toContain('drop');
  });
});

describe('E2E: Layout Toggle Consistency', () => {
  it('should never allow both editor and preview to be hidden', () => {
    // Ensure both are visible
    if (!getState().showEditor) toggleEditor();
    if (!getState().showPreview) togglePreview();

    // Hide editor, then try to hide preview — one must remain
    toggleEditor();
    expect(getState().showEditor).toBe(false);
    togglePreview();
    // Should force editor back on
    expect(getState().showEditor || getState().showPreview).toBe(true);
  });
});
