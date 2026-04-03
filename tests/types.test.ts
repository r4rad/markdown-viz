import { describe, it, expect } from 'vitest';
import type { FileTab, AppState, ThemeDefinition, UserProfile } from '../src/types';

describe('Type Definitions (Smoke Tests)', () => {
  it('should create valid FileTab objects', () => {
    const tab: FileTab = {
      id: 'test-id',
      name: 'test.md',
      content: '# Hello',
      cursorPos: 0,
      scrollTop: 0,
      scrollPreview: 0,
      dirty: false,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };
    expect(tab.id).toBe('test-id');
    expect(tab.name).toBe('test.md');
    expect(tab.content).toBe('# Hello');
    expect(tab.dirty).toBe(false);
  });

  it('should create valid AppState objects', () => {
    const state: AppState = {
      tabs: [],
      activeTabId: null,
      theme: 'github-dark',
      syncScroll: true,
      showPreview: true,
      showEditor: true,
      sidebarOpen: false,
    };
    expect(state.tabs).toEqual([]);
    expect(state.activeTabId).toBeNull();
    expect(state.theme).toBe('github-dark');
  });

  it('should create valid ThemeDefinition objects', () => {
    const theme: ThemeDefinition = {
      id: 'custom',
      name: 'Custom Theme',
      type: 'dark',
      colors: {
        '--bg-primary': '#1e1e1e',
        '--text-primary': '#ffffff',
      },
    };
    expect(theme.type).toBe('dark');
    expect(theme.colors['--bg-primary']).toBe('#1e1e1e');
  });

  it('should create valid UserProfile objects', () => {
    const profile: UserProfile = {
      uid: 'user-123',
      displayName: 'Test User',
      email: 'test@example.com',
      photoURL: null,
      provider: 'github',
    };
    expect(profile.uid).toBe('user-123');
    expect(profile.provider).toBe('github');
  });

  it('should enforce provider type', () => {
    const githubProfile: UserProfile = {
      uid: '1', displayName: null, email: null, photoURL: null, provider: 'github',
    };
    const googleProfile: UserProfile = {
      uid: '2', displayName: null, email: null, photoURL: null, provider: 'google',
    };
    expect(githubProfile.provider).toBe('github');
    expect(googleProfile.provider).toBe('google');
  });

  it('should handle nullable fields in UserProfile', () => {
    const profile: UserProfile = {
      uid: 'null-test',
      displayName: null,
      email: null,
      photoURL: null,
      provider: 'google',
    };
    expect(profile.displayName).toBeNull();
    expect(profile.email).toBeNull();
    expect(profile.photoURL).toBeNull();
  });

  it('should handle FileTab with edge case values', () => {
    const tab: FileTab = {
      id: '',
      name: '',
      content: '',
      cursorPos: -1,
      scrollTop: 0,
      scrollPreview: 0,
      dirty: true,
      updatedAt: 0,
      createdAt: 0,
    };
    expect(tab.id).toBe('');
    expect(tab.cursorPos).toBe(-1);
    expect(tab.dirty).toBe(true);
  });

  it('should handle AppState with tabs', () => {
    const tab: FileTab = {
      id: 'tab-1',
      name: 'doc.md',
      content: '# Doc',
      cursorPos: 0,
      scrollTop: 0,
      scrollPreview: 0,
      dirty: false,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };
    const state: AppState = {
      tabs: [tab],
      activeTabId: 'tab-1',
      theme: 'monokai',
      syncScroll: false,
      showPreview: false,
      showEditor: true,
      sidebarOpen: true,
    };
    expect(state.tabs.length).toBe(1);
    expect(state.activeTabId).toBe('tab-1');
    expect(state.showPreview).toBe(false);
    expect(state.sidebarOpen).toBe(true);
  });
});
