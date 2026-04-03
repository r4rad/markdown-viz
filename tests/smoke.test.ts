import { describe, it, expect, vi } from 'vitest';
import { on, emit } from '../src/lib/events';
import {
  getState, getActiveTab, addTab, closeTab, switchTab,
  updateTabContent, updateTabName, setTheme,
  toggleEditor, togglePreview, toggleSyncScroll, restoreState,
} from '../src/lib/state';
import { themes, getTheme, getSavedTheme } from '../src/themes/themes';

/**
 * Smoke tests verify the app's core modules can load and integrate.
 * These catch import errors, circular dependencies, and initialization issues.
 */

describe('Smoke Tests', () => {
  it('should import events module without error', async () => {
    const events = await import('../src/lib/events');
    expect(events.on).toBeTypeOf('function');
    expect(events.emit).toBeTypeOf('function');
  });

  it('should import state module without error', async () => {
    const state = await import('../src/lib/state');
    expect(state.getState).toBeTypeOf('function');
    expect(state.getActiveTab).toBeTypeOf('function');
    expect(state.addTab).toBeTypeOf('function');
    expect(state.closeTab).toBeTypeOf('function');
    expect(state.switchTab).toBeTypeOf('function');
    expect(state.updateTabContent).toBeTypeOf('function');
    expect(state.updateTabName).toBeTypeOf('function');
    expect(state.setTheme).toBeTypeOf('function');
    expect(state.toggleSyncScroll).toBeTypeOf('function');
    expect(state.togglePreview).toBeTypeOf('function');
    expect(state.toggleEditor).toBeTypeOf('function');
    expect(state.restoreState).toBeTypeOf('function');
  });

  it('should import themes module without error', async () => {
    const mod = await import('../src/themes/themes');
    expect(mod.themes).toBeInstanceOf(Array);
    expect(mod.getTheme).toBeTypeOf('function');
    expect(mod.applyTheme).toBeTypeOf('function');
    expect(mod.getSavedTheme).toBeTypeOf('function');
  });

  it('should import icons module without error', async () => {
    const icons = await import('../src/components/icons');
    expect(icons.icon).toBeTypeOf('function');
    expect(icons.iconEl).toBeTypeOf('function');
  });

  it('should import types without error', async () => {
    const types = await import('../src/types');
    expect(types).toBeDefined();
  });

  it('should import firebase-config without error', async () => {
    const config = await import('../src/lib/firebase-config');
    expect(config.isFirebaseConfigured).toBeTypeOf('function');
  });

  it('state module should have valid initial state', () => {
    const state = getState();
    expect(state.tabs.length).toBeGreaterThan(0);
    expect(state.activeTabId).toBeTruthy();
    expect(state.theme).toBeTruthy();

    const tab = getActiveTab();
    expect(tab).not.toBeNull();
    expect(tab!.name).toBeTruthy();
    expect(typeof tab!.content).toBe('string');
  });

  it('event system should work end-to-end', () => {
    const results: string[] = [];
    const unsub = on('smoke-test', (val: string) => results.push(val));
    emit('smoke-test', 'hello');
    emit('smoke-test', 'world');
    unsub();
    emit('smoke-test', 'ignored');
    expect(results).toEqual(['hello', 'world']);
  });

  it('theme system should work end-to-end', () => {
    expect(themes.length).toBeGreaterThan(0);
    expect(getTheme(themes[0].id)).toBeDefined();
    expect(typeof getSavedTheme()).toBe('string');
  });
});

describe('Integration Tests', () => {
  it('state + events: addTab should emit events', () => {
    const events: string[] = [];
    const unsub1 = on('tab-added', () => events.push('tab-added'));
    const unsub2 = on('active-tab-changed', () => events.push('active-tab-changed'));
    const unsub3 = on('state-changed', () => events.push('state-changed'));

    addTab('IntegrationTest.md', '# Test');
    expect(events).toContain('tab-added');
    expect(events).toContain('active-tab-changed');
    expect(events).toContain('state-changed');

    unsub1(); unsub2(); unsub3();
  });

  it('state + events: closeTab should emit events', () => {
    const tab = addTab('ToClose.md', 'x');
    const events: string[] = [];
    const unsub1 = on('tab-closed', () => events.push('tab-closed'));
    const unsub2 = on('state-changed', () => events.push('state-changed'));

    closeTab(tab.id);
    expect(events).toContain('tab-closed');
    expect(events).toContain('state-changed');

    unsub1(); unsub2();
  });

  it('state + events: updateTabContent should emit content-changed', () => {
    const tab = addTab('ContentTest.md', 'original');
    let received: any = null;
    const unsub = on('content-changed', (data: any) => { received = data; });

    updateTabContent(tab.id, 'updated');
    expect(received).toEqual({ id: tab.id, content: 'updated' });

    unsub();
  });

  it('state + events: theme change should emit theme-changed', () => {
    let received: string | null = null;
    const unsub = on('theme-changed', (id: string) => { received = id; });

    setTheme('dracula');
    expect(received).toBe('dracula');

    unsub();
  });

  it('state: multiple tab operations should maintain consistency', () => {
    const t1 = addTab('Multi1.md', 'content1');
    const t2 = addTab('Multi2.md', 'content2');
    const t3 = addTab('Multi3.md', 'content3');

    expect(getState().activeTabId).toBe(t3.id);

    switchTab(t1.id);
    expect(getState().activeTabId).toBe(t1.id);
    expect(getActiveTab()!.name).toBe('Multi1.md');

    closeTab(t2.id);
    expect(getState().tabs.find((t: any) => t.id === t2.id)).toBeUndefined();
    expect(getState().activeTabId).toBe(t1.id);

    closeTab(t1.id);
    expect(getActiveTab()).not.toBeNull();
  });
});

describe('Regression Tests', () => {
  it('should not crash when closing the only tab', () => {
    while (getState().tabs.length > 1) {
      closeTab(getState().tabs[0].id);
    }
    const lastId = getState().tabs[0].id;
    expect(() => closeTab(lastId)).not.toThrow();
    expect(getState().tabs.length).toBe(1);
  });

  it('should not crash with empty content', () => {
    const tab = addTab('Empty.md', '');
    updateTabContent(tab.id, '');
    const found = getState().tabs.find((t: any) => t.id === tab.id);
    expect(found!.content).toBe('');
  });

  it('should not crash with very large content', () => {
    const largeContent = 'x'.repeat(100000);
    const tab = addTab('Large.md', largeContent);
    expect(tab.content.length).toBe(100000);
    updateTabContent(tab.id, largeContent + ' more');
    const found = getState().tabs.find((t: any) => t.id === tab.id);
    expect(found!.content.length).toBe(100005);
  });

  it('should handle special characters in tab names', () => {
    const tab = addTab('test.md', 'content');
    const specialNames = [
      'file with spaces.md',
      'résumé.md',
      '日本語.md',
      'file<>&"\'`.md',
      '../../../etc/passwd',
    ];
    for (const name of specialNames) {
      updateTabName(tab.id, name);
      const found = getState().tabs.find((t: any) => t.id === tab.id);
      expect(found!.name).toBe(name);
    }
  });

  it('should handle rapid toggle operations', () => {
    for (let i = 0; i < 100; i++) {
      toggleEditor();
      togglePreview();
      toggleSyncScroll();
    }
    const state = getState();
    expect(typeof state.showEditor).toBe('boolean');
    expect(typeof state.showPreview).toBe('boolean');
    expect(typeof state.syncScroll).toBe('boolean');
    expect(state.showEditor || state.showPreview).toBe(true);
  });

  it('should handle restoreState with empty tabs', () => {
    restoreState({ tabs: [] as any });
    // State should still have tabs (empty array doesn't trigger replacement)
  });
});
