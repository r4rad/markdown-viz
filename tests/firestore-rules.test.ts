import { describe, it, expect } from 'vitest';
import {
  rulesCanComment,
  rulesCanEditBody,
  rulesCanMutateMembership,
  rulesCanTransferOwnershipFromClient,
  rulesClientCanSelfEnrollMembership,
  rulesClientCanWriteBackendManagedCollection,
  rulesClientCanWriteWorkspaceFile,
} from '../src/lib/firestore-rules-policy';
import { canCommentWorkspace, canManageMembers, canWriteWorkspace } from '../src/lib/workspace-acl';
import type { Role } from '../src/types';

/**
 * Emulator-equivalent ACL matrix for firestore.rules.
 * When Java + Firestore emulator are available, prefer:
 *   firebase emulators:exec --only firestore "npx vitest run tests/firestore-rules.test.ts"
 * These pure checks stay green under `npm test` without the emulator.
 */
const ROLES: Role[] = ['owner', 'editor', 'commentator', 'viewer'];

describe('firestore rules ACL matrix (emulator policy)', () => {
  it('viewer and commentator cannot write markdown body / folders / files', () => {
    expect(rulesCanEditBody('viewer')).toBe(false);
    expect(rulesCanEditBody('commentator')).toBe(false);
    expect(rulesClientCanWriteWorkspaceFile('viewer')).toBe(false);
    expect(rulesClientCanWriteWorkspaceFile('commentator')).toBe(false);
    expect(canWriteWorkspace('viewer')).toBe(false);
    expect(canWriteWorkspace('commentator')).toBe(false);
  });

  it('editor and owner can write body', () => {
    expect(rulesCanEditBody('editor')).toBe(true);
    expect(rulesCanEditBody('owner')).toBe(true);
    expect(canWriteWorkspace('editor')).toBe(true);
    expect(canWriteWorkspace('owner')).toBe(true);
  });

  it('commentator can comment; viewer cannot', () => {
    expect(rulesCanComment('commentator')).toBe(true);
    expect(rulesCanComment('editor')).toBe(true);
    expect(rulesCanComment('owner')).toBe(true);
    expect(rulesCanComment('viewer')).toBe(false);
    expect(canCommentWorkspace('commentator')).toBe(true);
    expect(canCommentWorkspace('viewer')).toBe(false);
  });

  it('authenticated non-owner cannot mutate membership', () => {
    for (const role of ROLES) {
      const allowed = rulesCanMutateMembership(role);
      if (role === 'owner') expect(allowed).toBe(true);
      else expect(allowed).toBe(false);
    }
    expect(canManageMembers('editor')).toBe(false);
    expect(canManageMembers('commentator')).toBe(false);
    expect(canManageMembers('viewer')).toBe(false);
    expect(canManageMembers('owner')).toBe(true);
  });

  it('non-owner cannot mutate ownership; owner cannot transfer ownership from client', () => {
    expect(rulesCanTransferOwnershipFromClient(false, true)).toBe(false);
    expect(rulesCanTransferOwnershipFromClient(false, false)).toBe(false);
    expect(rulesCanTransferOwnershipFromClient(true, true)).toBe(false);
    expect(rulesCanTransferOwnershipFromClient(true, false)).toBe(true);
  });

  it('clients cannot write syncJobs, repoLinks, history, conflicts, or invites', () => {
    for (const col of ['repoLinks', 'syncJobs', 'history', 'conflicts', 'invites'] as const) {
      expect(rulesClientCanWriteBackendManagedCollection(col)).toBe(false);
    }
  });

  it('clients cannot self-assign a non-owner role in Firestore', () => {
    expect(rulesClientCanSelfEnrollMembership(false, true, 'editor')).toBe(false);
    expect(rulesClientCanSelfEnrollMembership(false, true, 'viewer')).toBe(false);
    expect(rulesClientCanSelfEnrollMembership(true, true, 'editor')).toBe(false);
    expect(rulesClientCanSelfEnrollMembership(true, true, 'owner')).toBe(true);
  });

  it('role matrix covers viewer/commentator/editor/owner for body vs membership', () => {
    const matrix = ROLES.map((role) => ({
      role,
      body: rulesCanEditBody(role),
      comment: rulesCanComment(role),
      members: rulesCanMutateMembership(role),
    }));
    expect(matrix).toEqual([
      { role: 'owner', body: true, comment: true, members: true },
      { role: 'editor', body: true, comment: true, members: false },
      { role: 'commentator', body: false, comment: true, members: false },
      { role: 'viewer', body: false, comment: false, members: false },
    ]);
  });
});
