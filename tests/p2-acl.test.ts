import { describe, it, expect } from 'vitest';
import {
  canWriteWorkspace,
  canReadActivity,
  canQueryWorkspaceActivity,
  activityCreateAllowed,
  canReadWorkspace,
  isWorkspaceMember,
} from '../src/lib/workspace-acl';
import { copyTreeToWorkspacePayload } from '../src/lib/shared-workspace';
import type { FileTab, WorkspaceFolder } from '../src/types';

describe('workspace ACL (rules matrix)', () => {
  it('non-members cannot read', () => {
    expect(canReadWorkspace(false)).toBe(false);
    expect(isWorkspaceMember([{ uid: 'a' }], 'b')).toBe(false);
  });

  it('viewer cannot write; editor and owner can', () => {
    expect(canWriteWorkspace('viewer')).toBe(false);
    expect(canWriteWorkspace('editor')).toBe(true);
    expect(canWriteWorkspace('owner')).toBe(true);
  });

  it('owner reads all activity; others self-only', () => {
    expect(canReadActivity('owner', 'u2', 'u1')).toBe(true);
    expect(canReadActivity('editor', 'u2', 'u1')).toBe(false);
    expect(canReadActivity('editor', 'u1', 'u1')).toBe(true);
    expect(canQueryWorkspaceActivity('editor')).toBe(false);
    expect(canQueryWorkspaceActivity('owner')).toBe(true);
  });

  it('activity create requires actorId == auth.uid', () => {
    expect(activityCreateAllowed('u1', 'u1')).toBe(true);
    expect(activityCreateAllowed('u1', 'u2')).toBe(false);
  });

  it('copy tree does not mutate personal folders', () => {
    const folders: WorkspaceFolder[] = [{
      id: 'f1', name: 'Docs', parentId: null, createdAt: 1, updatedAt: 1,
    }];
    const tabs: FileTab[] = [{
      id: 't1', name: 'a.md', content: 'x', cursorPos: 0, scrollTop: 0, scrollPreview: 0,
      dirty: false, updatedAt: 1, createdAt: 1, folderId: 'f1', origin: { kind: 'local' },
    }];
    const payload = copyTreeToWorkspacePayload(folders, tabs);
    folders[0].name = 'Changed';
    expect(payload.folders[0].name).toBe('Docs');
  });
});
