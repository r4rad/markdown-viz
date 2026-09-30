import { describe, it, expect } from 'vitest';
import { setWorkspaceContext, getState } from '../src/lib/state';
import {
  buildGuestWorkspaceStub,
  buildOrganizationCreatePayload,
  normalizeWorkspaceKind,
  workspaceSwitcherLabel,
} from '../src/lib/workspace-kinds';
import type { FileTab, WorkspaceFolder } from '../src/types';

describe('workspace kinds model', () => {
  it('builds organization create payload with kind=organization, orgId, and owner membership', () => {
    const payload = buildOrganizationCreatePayload({
      workspaceId: 'ws-1',
      orgId: 'org-1',
      name: 'Acme',
      ownerId: 'u1',
      ownerEmail: 'u1@example.com',
      now: 1000,
    });

    expect(payload.organization).toMatchObject({
      id: 'org-1',
      name: 'Acme',
      ownerId: 'u1',
      createdAt: 1000,
    });
    expect(payload.workspace).toMatchObject({
      id: 'ws-1',
      kind: 'organization',
      orgId: 'org-1',
      name: 'Acme',
      ownerId: 'u1',
    });
    expect(payload.membership).toMatchObject({
      uid: 'u1',
      email: 'u1@example.com',
      role: 'owner',
      addedAt: 1000,
    });
    expect(payload.userMembership.kind).toBe('organization');
  });

  it('builds a guest workspace stub', () => {
    const guest = buildGuestWorkspaceStub({
      id: 'guest-1',
      ownerId: 'anon',
      name: 'Local guest',
      now: 42,
    });
    expect(guest.kind).toBe('guest');
    expect(guest.orgId).toBeUndefined();
    expect(guest.name).toBe('Local guest');
    expect(guest.ownerId).toBe('anon');
  });

  it('normalizes missing/legacy kinds to organization', () => {
    expect(normalizeWorkspaceKind(undefined)).toBe('organization');
    expect(normalizeWorkspaceKind('shared')).toBe('organization');
    expect(normalizeWorkspaceKind('guest')).toBe('guest');
    expect(normalizeWorkspaceKind('personal')).toBe('personal');
  });

  it('labels switcher options by kind', () => {
    expect(workspaceSwitcherLabel('personal', 'Personal')).toBe('Personal');
    expect(workspaceSwitcherLabel('organization', 'Acme')).toBe('Org: Acme');
    expect(workspaceSwitcherLabel('guest', 'Draft')).toBe('Guest: Draft');
    expect(workspaceSwitcherLabel(undefined, 'Legacy')).toBe('Org: Legacy');
  });

  it('loads an isolated tree when switching workspace context', () => {
    const personalFolders: WorkspaceFolder[] = [
      { id: 'pf', name: 'Personal', parentId: null, createdAt: 1, updatedAt: 1 },
    ];
    const personalTabs: FileTab[] = [
      {
        id: 'pt',
        name: 'personal.md',
        content: 'personal',
        cursorPos: 0,
        scrollTop: 0,
        scrollPreview: 0,
        dirty: false,
        updatedAt: 1,
        createdAt: 1,
        folderId: null,
        origin: { kind: 'local' },
      },
    ];
    setWorkspaceContext({
      workspaceId: 'personal',
      role: null,
      folders: personalFolders,
      tabs: personalTabs,
    });
    expect(getState().activeWorkspaceId).toBe('personal');
    expect(getState().tabs[0].content).toBe('personal');

    const orgFolders: WorkspaceFolder[] = [
      { id: 'of', name: 'Org', parentId: null, createdAt: 2, updatedAt: 2 },
    ];
    const orgTabs: FileTab[] = [
      {
        id: 'ot',
        name: 'org.md',
        content: 'org-isolated',
        cursorPos: 0,
        scrollTop: 0,
        scrollPreview: 0,
        dirty: false,
        updatedAt: 2,
        createdAt: 2,
        folderId: 'of',
        origin: { kind: 'local' },
      },
    ];
    setWorkspaceContext({
      workspaceId: 'ws-org',
      role: 'owner',
      folders: orgFolders,
      tabs: orgTabs,
    });

    const after = getState();
    expect(after.activeWorkspaceId).toBe('ws-org');
    expect(after.folders).toEqual(orgFolders);
    expect(after.tabs.map(t => t.content)).toEqual(['org-isolated']);
    expect(after.tabs.map(t => t.id)).not.toContain('pt');
  });
});
