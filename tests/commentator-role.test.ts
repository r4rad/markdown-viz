import { describe, it, expect, beforeEach } from 'vitest';
import {
  canWriteWorkspace,
  canCommentWorkspace,
  canManageMembers,
  canSyncWiki,
  canRestoreVersion,
} from '../src/lib/workspace-acl';
import {
  addFolder,
  canEditActiveWorkspace,
  getActiveTab,
  getState,
  moveFolder,
  renameFolder,
  setWorkspaceContext,
  updateTabContent,
  updateTabName,
} from '../src/lib/state';
import { on } from '../src/lib/events';
import type { FileTab, WorkspaceFolder } from '../src/types';

describe('commentator role + ACL', () => {
  beforeEach(() => {
    const folders: WorkspaceFolder[] = [
      { id: 'f1', name: 'Docs', parentId: null, createdAt: 1, updatedAt: 1 },
    ];
    const tabs: FileTab[] = [
      {
        id: 't1',
        name: 'doc.md',
        content: 'hello',
        cursorPos: 0,
        scrollTop: 0,
        scrollPreview: 0,
        dirty: false,
        updatedAt: 1,
        createdAt: 1,
        folderId: 'f1',
        origin: { kind: 'local' },
      },
    ];
    setWorkspaceContext({
      workspaceId: 'ws-shared',
      role: 'commentator',
      folders,
      tabs,
    });
  });

  it('ACL: canWriteWorkspace is false; canCommentWorkspace is true', () => {
    expect(canWriteWorkspace('commentator')).toBe(false);
    expect(canCommentWorkspace('commentator')).toBe(true);
    expect(canManageMembers('commentator')).toBe(false);
    expect(canSyncWiki('commentator')).toBe(false);
    expect(canRestoreVersion('commentator')).toBe(false);
    expect(canEditActiveWorkspace()).toBe(false);
  });

  it('rejects Markdown body writes for commentator', () => {
    const errors: string[] = [];
    const off = on('workspace-error', (msg: unknown) => {
      errors.push(String(msg));
    });
    const tab = getActiveTab()!;
    updateTabContent(tab.id, 'changed by commentator');
    expect(getActiveTab()!.content).toBe('hello');
    updateTabName(tab.id, 'renamed.md');
    expect(getActiveTab()!.name).toBe('doc.md');
    expect(errors.length).toBeGreaterThan(0);
    off();
  });

  it('rejects folder writes for commentator', () => {
    const before = getState().folders.map(f => ({ ...f }));
    addFolder('blocked', null);
    renameFolder('f1', 'Nope');
    moveFolder('f1', null);
    expect(getState().folders).toEqual(before);
  });

  it('editor and owner retain write ACL; viewer cannot comment', () => {
    expect(canWriteWorkspace('editor')).toBe(true);
    expect(canWriteWorkspace('owner')).toBe(true);
    expect(canCommentWorkspace('viewer')).toBe(false);
    expect(canCommentWorkspace('editor')).toBe(true);
  });
});
