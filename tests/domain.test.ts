import { describe, it, expect } from 'vitest';
import {
  canWriteWorkspace,
  canCommentWorkspace,
  canManageMembers,
  canRestoreVersion,
  canSyncWiki,
  type WorkspaceKind,
  type Role,
  type SyncStatus,
  type SyncJob,
  type Conflict,
  type HistoryEvent,
  type Workspace,
} from '@markdown-viz/domain';

const WORKSPACE_KINDS: WorkspaceKind[] = ['personal', 'organization', 'guest'];
const ROLES: Role[] = ['owner', 'editor', 'commentator', 'viewer'];
const SYNC_STATUSES: SyncStatus[] = ['InSync', 'Ahead', 'Behind', 'Conflict'];

describe('domain package types', () => {
  it('exposes personal | organization | guest workspace kinds', () => {
    const workspace: Workspace = {
      id: 'ws-1',
      kind: 'organization',
      name: 'Acme',
      orgId: 'org-1',
      ownerId: 'u1',
      createdAt: 1,
      updatedAt: 1,
    };
    expect(WORKSPACE_KINDS).toContain(workspace.kind);
    expect(WORKSPACE_KINDS).toEqual(['personal', 'organization', 'guest']);
  });

  it('exposes commentator in Role', () => {
    expect(ROLES).toContain('commentator');
    expect(ROLES).toEqual(['owner', 'editor', 'commentator', 'viewer']);
  });

  it('exposes SyncStatus InSync | Ahead | Behind | Conflict', () => {
    expect(SYNC_STATUSES).toEqual(['InSync', 'Ahead', 'Behind', 'Conflict']);
  });

  it('accepts SyncJob, Conflict, and HistoryEvent shapes', () => {
    const job: SyncJob = {
      id: 'j1',
      documentId: 'd1',
      workspaceId: 'ws-1',
      state: 'queued',
      quietUntil: 1000,
      attempt: 0,
    };
    const conflict: Conflict = {
      id: 'c1',
      documentId: 'd1',
      workspaceId: 'ws-1',
      baseSha: 'abc',
      localChecksum: 'local',
      remoteSha: 'def',
      status: 'open',
    };
    const event: HistoryEvent = {
      id: 'h1',
      documentId: 'd1',
      workspaceId: 'ws-1',
      authorId: 'u1',
      createdAt: 1,
      source: 'save',
      checksum: 'chk',
    };
    expect(job.state).toBe('queued');
    expect(conflict.status).toBe('open');
    expect(event.source).toBe('save');
  });
});

describe('domain ACL helpers (commentator vs editor)', () => {
  it('commentator cannot write body/folders/GitHub; editor can', () => {
    expect(canWriteWorkspace('commentator')).toBe(false);
    expect(canWriteWorkspace('editor')).toBe(true);
    expect(canRestoreVersion('commentator')).toBe(false);
    expect(canRestoreVersion('editor')).toBe(true);
    expect(canSyncWiki('commentator')).toBe(false);
    expect(canSyncWiki('editor')).toBe(true);
  });

  it('commentator can comment; viewer cannot; editor can', () => {
    expect(canCommentWorkspace('commentator')).toBe(true);
    expect(canCommentWorkspace('editor')).toBe(true);
    expect(canCommentWorkspace('viewer')).toBe(false);
  });

  it('neither commentator nor editor can manage members', () => {
    expect(canManageMembers('commentator')).toBe(false);
    expect(canManageMembers('editor')).toBe(false);
    expect(canManageMembers('owner')).toBe(true);
  });
});
