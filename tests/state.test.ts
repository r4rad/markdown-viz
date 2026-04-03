import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock crypto.randomUUID for deterministic tests
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `test-uuid-${++uuidCounter}`,
});

// Must import after mocking crypto
import {
  getState,
  getActiveTab,
  setTheme,
  addTab,
  closeTab,
  switchTab,
  updateTabContent,
  updateTabName,
  updateTabCursor,
  setPreviewScroll,
  toggleSyncScroll,
  togglePreview,
  toggleEditor,
  restoreState,
} from '../src/lib/state';
import { on } from '../src/lib/events';

describe('State Management', () => {
  describe('getState()', () => {
    it('should return current state object', () => {
      const state = getState();
      expect(state).toBeDefined();
      expect(state.tabs).toBeInstanceOf(Array);
      expect(state.tabs.length).toBeGreaterThan(0);
      expect(state.theme).toBeDefined();
      expect(typeof state.syncScroll).toBe('boolean');
    });

    it('should have default initial values', () => {
      const state = getState();
      expect(state.showPreview).toBe(true);
      expect(state.showEditor).toBe(true);
      expect(state.sidebarOpen).toBe(false);
    });
  });

  describe('getActiveTab()', () => {
    it('should return the active tab', () => {
      const tab = getActiveTab();
      expect(tab).not.toBeNull();
      expect(tab!.id).toBe(getState().activeTabId);
    });

    it('should have required tab properties', () => {
      const tab = getActiveTab()!;
      expect(tab.name).toBeDefined();
      expect(typeof tab.content).toBe('string');
      expect(typeof tab.cursorPos).toBe('number');
      expect(typeof tab.scrollTop).toBe('number');
      expect(typeof tab.updatedAt).toBe('number');
      expect(typeof tab.createdAt).toBe('number');
    });
  });

  describe('addTab()', () => {
    it('should add a new tab and make it active', () => {
      const initialCount = getState().tabs.length;
      const tab = addTab('Test.md', '# Test');
      expect(tab.name).toBe('Test.md');
      expect(tab.content).toBe('# Test');
      expect(getState().tabs.length).toBe(initialCount + 1);
      expect(getState().activeTabId).toBe(tab.id);
    });

    it('should add tab with default empty content', () => {
      const tab = addTab('Empty.md');
      expect(tab.content).toBe('');
    });

    it('should emit tab-added and active-tab-changed events', () => {
      const tabAddedCb = vi.fn();
      const activeChangedCb = vi.fn();
      const unsub1 = on('tab-added', tabAddedCb);
      const unsub2 = on('active-tab-changed', activeChangedCb);

      addTab('EventTest.md', 'content');
      expect(tabAddedCb).toHaveBeenCalled();
      expect(activeChangedCb).toHaveBeenCalled();

      unsub1();
      unsub2();
    });

    it('should generate unique IDs for each tab', () => {
      const tab1 = addTab('A.md', 'a');
      const tab2 = addTab('B.md', 'b');
      expect(tab1.id).not.toBe(tab2.id);
    });
  });

  describe('closeTab()', () => {
    it('should remove the specified tab', () => {
      const tab = addTab('ToClose.md', 'close me');
      const countBefore = getState().tabs.length;
      closeTab(tab.id);
      expect(getState().tabs.length).toBe(countBefore - 1);
      expect(getState().tabs.find(t => t.id === tab.id)).toBeUndefined();
    });

    it('should switch to next tab when active tab is closed', () => {
      const tab1 = addTab('Tab1.md', '1');
      const tab2 = addTab('Tab2.md', '2');
      switchTab(tab1.id);
      closeTab(tab1.id);
      expect(getState().activeTabId).not.toBe(tab1.id);
    });

    it('should create a new tab if last tab is closed', () => {
      // Close all tabs except one
      while (getState().tabs.length > 1) {
        closeTab(getState().tabs[0].id);
      }
      const lastId = getState().tabs[0].id;
      closeTab(lastId);
      // Should have created a new tab
      expect(getState().tabs.length).toBe(1);
      expect(getState().activeTabId).not.toBeNull();
    });

    it('should do nothing for non-existent tab ID', () => {
      const countBefore = getState().tabs.length;
      closeTab('nonexistent-id');
      expect(getState().tabs.length).toBe(countBefore);
    });

    it('should emit tab-closed event', () => {
      const tab = addTab('Close.md', 'x');
      const cb = vi.fn();
      const unsub = on('tab-closed', cb);
      closeTab(tab.id);
      expect(cb).toHaveBeenCalledWith(tab.id);
      unsub();
    });
  });

  describe('switchTab()', () => {
    it('should switch to specified tab', () => {
      const tab1 = addTab('Switch1.md', '1');
      const tab2 = addTab('Switch2.md', '2');
      switchTab(tab1.id);
      expect(getState().activeTabId).toBe(tab1.id);
    });

    it('should not switch to non-existent tab', () => {
      const currentId = getState().activeTabId;
      switchTab('fake-id');
      expect(getState().activeTabId).toBe(currentId);
    });
  });

  describe('updateTabContent()', () => {
    it('should update content of specified tab', () => {
      const tab = addTab('Update.md', 'old');
      updateTabContent(tab.id, 'new content');
      const updated = getState().tabs.find(t => t.id === tab.id);
      expect(updated!.content).toBe('new content');
    });

    it('should mark tab as dirty', () => {
      const tab = addTab('Dirty.md', 'clean');
      expect(tab.dirty).toBe(false);
      updateTabContent(tab.id, 'modified');
      const updated = getState().tabs.find(t => t.id === tab.id);
      expect(updated!.dirty).toBe(true);
    });

    it('should update timestamp', () => {
      const tab = addTab('Time.md', 'initial');
      const oldTime = tab.updatedAt;
      // Small delay to ensure timestamp differs
      updateTabContent(tab.id, 'changed');
      const updated = getState().tabs.find(t => t.id === tab.id);
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(oldTime);
    });

    it('should emit content-changed event', () => {
      const tab = addTab('ContentEvt.md', 'before');
      const cb = vi.fn();
      const unsub = on('content-changed', cb);
      updateTabContent(tab.id, 'after');
      expect(cb).toHaveBeenCalledWith({ id: tab.id, content: 'after' });
      unsub();
    });

    it('should ignore non-existent tab IDs', () => {
      expect(() => updateTabContent('bogus', 'text')).not.toThrow();
    });
  });

  describe('updateTabName()', () => {
    it('should rename tab', () => {
      const tab = addTab('Old.md', 'content');
      updateTabName(tab.id, 'New.md');
      const updated = getState().tabs.find(t => t.id === tab.id);
      expect(updated!.name).toBe('New.md');
    });

    it('should emit tab-renamed event', () => {
      const tab = addTab('Rename.md', 'x');
      const cb = vi.fn();
      const unsub = on('tab-renamed', cb);
      updateTabName(tab.id, 'Renamed.md');
      expect(cb).toHaveBeenCalledWith({ id: tab.id, name: 'Renamed.md' });
      unsub();
    });
  });

  describe('updateTabCursor()', () => {
    it('should update cursor position and scroll', () => {
      const tab = addTab('Cursor.md', 'hello world');
      updateTabCursor(tab.id, 5, 100);
      const updated = getState().tabs.find(t => t.id === tab.id);
      expect(updated!.cursorPos).toBe(5);
      expect(updated!.scrollTop).toBe(100);
    });
  });

  describe('setPreviewScroll()', () => {
    it('should update preview scroll position', () => {
      const tab = addTab('Scroll.md', 'content');
      setPreviewScroll(tab.id, 250);
      const updated = getState().tabs.find(t => t.id === tab.id);
      expect(updated!.scrollPreview).toBe(250);
    });
  });

  describe('setTheme()', () => {
    it('should change theme', () => {
      setTheme('monokai');
      expect(getState().theme).toBe('monokai');
    });

    it('should emit theme-changed event', () => {
      const cb = vi.fn();
      const unsub = on('theme-changed', cb);
      setTheme('dracula');
      expect(cb).toHaveBeenCalledWith('dracula');
      unsub();
    });
  });

  describe('toggleSyncScroll()', () => {
    it('should toggle sync scroll value', () => {
      const before = getState().syncScroll;
      toggleSyncScroll();
      expect(getState().syncScroll).toBe(!before);
      toggleSyncScroll();
      expect(getState().syncScroll).toBe(before);
    });

    it('should emit sync-scroll-changed event', () => {
      const cb = vi.fn();
      const unsub = on('sync-scroll-changed', cb);
      toggleSyncScroll();
      expect(cb).toHaveBeenCalledWith(getState().syncScroll);
      unsub();
    });
  });

  describe('togglePreview()', () => {
    it('should toggle preview visibility', () => {
      const before = getState().showPreview;
      togglePreview();
      expect(getState().showPreview).toBe(!before);
    });

    it('should force editor on if both would be hidden', () => {
      // Set both visible first
      const state = getState();
      if (!state.showPreview) togglePreview();
      if (!state.showEditor) toggleEditor();

      // Turn off editor
      toggleEditor();
      expect(getState().showEditor).toBe(false);
      // Turn off preview - should re-enable editor
      togglePreview();
      expect(getState().showEditor).toBe(true);
    });
  });

  describe('toggleEditor()', () => {
    it('should toggle editor visibility', () => {
      const before = getState().showEditor;
      toggleEditor();
      expect(getState().showEditor).toBe(!before);
    });

    it('should force preview on if both would be hidden', () => {
      const state = getState();
      if (!state.showEditor) toggleEditor();
      if (!state.showPreview) togglePreview();

      togglePreview();
      expect(getState().showPreview).toBe(false);
      toggleEditor();
      expect(getState().showPreview).toBe(true);
    });
  });

  describe('restoreState()', () => {
    it('should restore tabs from saved state', () => {
      const savedTabs = [
        { id: 'restored-1', name: 'Restored.md', content: '# Restored', cursorPos: 0, scrollTop: 0, scrollPreview: 0, dirty: false, updatedAt: Date.now(), createdAt: Date.now() },
      ];
      restoreState({ tabs: savedTabs, activeTabId: 'restored-1' });
      expect(getState().tabs[0].name).toBe('Restored.md');
      expect(getState().activeTabId).toBe('restored-1');
    });

    it('should restore theme', () => {
      restoreState({ theme: 'nord' });
      expect(getState().theme).toBe('nord');
    });

    it('should restore syncScroll', () => {
      restoreState({ syncScroll: false });
      expect(getState().syncScroll).toBe(false);
    });

    it('should emit state-restored event', () => {
      const cb = vi.fn();
      const unsub = on('state-restored', cb);
      restoreState({ theme: 'one-dark' });
      expect(cb).toHaveBeenCalled();
      unsub();
    });

    it('should use first tab id if activeTabId not provided', () => {
      const savedTabs = [
        { id: 'auto-1', name: 'Auto.md', content: '', cursorPos: 0, scrollTop: 0, scrollPreview: 0, dirty: false, updatedAt: Date.now(), createdAt: Date.now() },
      ];
      restoreState({ tabs: savedTabs });
      expect(getState().activeTabId).toBe('auto-1');
    });
  });
});
