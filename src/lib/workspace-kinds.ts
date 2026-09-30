/** Pure helpers for personal / organization / guest workspace kinds (TPS 2.1). */

import type { Membership, Organization, SharedWorkspace, WorkspaceKind } from '../types';

export type CreateOrgWorkspaceInput = {
  workspaceId: string;
  orgId: string;
  name: string;
  ownerId: string;
  ownerEmail: string | null;
  now: number;
};

export type OrgCreatePayload = {
  organization: Organization & { ownerId: string };
  workspace: SharedWorkspace;
  membership: Membership;
  userMembership: {
    workspaceId: string;
    name: string;
    role: 'owner';
    kind: WorkspaceKind;
  };
};

/** Normalize persisted/legacy workspace docs that may omit `kind`. */
export function normalizeWorkspaceKind(
  kind: WorkspaceKind | string | undefined | null,
): WorkspaceKind {
  if (kind === 'personal' || kind === 'organization' || kind === 'guest') return kind;
  // Legacy "shared" workspaces behave as organization tenancy.
  return 'organization';
}

/** Switcher option label for a workspace kind + display name. */
export function workspaceSwitcherLabel(
  kind: WorkspaceKind | 'personal' | string | undefined | null,
  name: string,
): string {
  const display = name.trim() || 'Untitled';
  switch (normalizeWorkspaceKind(kind === 'personal' ? 'personal' : kind)) {
    case 'personal':
      return 'Personal';
    case 'guest':
      return `Guest: ${display}`;
    case 'organization':
    default:
      return `Org: ${display}`;
  }
}

/** Guest workspace stub — local/anonymous tenancy without org admin. */
export function buildGuestWorkspaceStub(input: {
  id: string;
  name?: string;
  ownerId: string;
  now?: number;
}): SharedWorkspace {
  const now = input.now ?? Date.now();
  return {
    id: input.id,
    kind: 'guest',
    name: (input.name ?? 'Guest').trim() || 'Guest',
    ownerId: input.ownerId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Build the Firestore payload for creating an organization workspace:
 * organization doc, workspace (kind=organization + orgId), and owner membership.
 */
export function buildOrganizationCreatePayload(input: CreateOrgWorkspaceInput): OrgCreatePayload {
  const name = input.name.trim() || 'Organization';
  const organization: Organization & { ownerId: string } = {
    id: input.orgId,
    name,
    createdAt: input.now,
    ownerId: input.ownerId,
  };
  const workspace: SharedWorkspace = {
    id: input.workspaceId,
    kind: 'organization',
    name,
    orgId: input.orgId,
    ownerId: input.ownerId,
    createdAt: input.now,
    updatedAt: input.now,
  };
  const membership: Membership = {
    uid: input.ownerId,
    email: input.ownerEmail,
    role: 'owner',
    addedAt: input.now,
  };
  return {
    organization,
    workspace,
    membership,
    userMembership: {
      workspaceId: input.workspaceId,
      name,
      role: 'owner',
      kind: 'organization',
    },
  };
}
