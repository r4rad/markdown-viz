export type InviteRole = 'editor' | 'commentator' | 'viewer';

export type InviteStatus = 'pending' | 'accepted';

export type WorkspaceInvite = {
  id: string;
  workspaceId: string;
  email: string;
  role: InviteRole;
  createdBy: string;
  createdAt: number;
  status: InviteStatus;
};

export type WorkspaceMembership = {
  workspaceId: string;
  uid: string;
  email: string | null;
  role: InviteRole | 'owner';
  addedAt: number;
};

export const INVITE_ROLES: readonly InviteRole[] = ['editor', 'commentator', 'viewer'];

export function isInviteRole(value: unknown): value is InviteRole {
  return typeof value === 'string' && (INVITE_ROLES as readonly string[]).includes(value);
}
