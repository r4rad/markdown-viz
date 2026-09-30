import { apiFetch, isApiConfigured } from './api-client';
import type { Role, WorkspaceInvite } from '../types';

export type CreateInviteResponse = {
  id: string;
  workspaceId: string;
  email: string;
  role: Exclude<Role, 'owner'>;
  status: string;
  acceptPath: string;
};

export type AcceptInviteResponse = {
  workspaceId: string;
  role: Exclude<Role, 'owner'>;
  uid: string;
};

export function inviteAcceptUrl(inviteId: string, origin = window.location.origin): string {
  return `${origin}/invite/${encodeURIComponent(inviteId)}`;
}

/** Owner creates a pending invite via Cloud Run (not client Firestore). */
export async function createServerInvite(
  workspaceId: string,
  email: string,
  role: Exclude<Role, 'owner'>,
): Promise<CreateInviteResponse> {
  if (!isApiConfigured()) {
    throw new Error('Server invites require VITE_API_BASE_URL');
  }
  return apiFetch<CreateInviteResponse>('/v1/invites', {
    method: 'POST',
    body: JSON.stringify({ workspaceId, email, role }),
  });
}

/** Invitee accepts via Cloud Run; email on the ID token must match. */
export async function acceptServerInvite(inviteId: string): Promise<AcceptInviteResponse> {
  if (!isApiConfigured()) {
    throw new Error('Server invites require VITE_API_BASE_URL');
  }
  return apiFetch<AcceptInviteResponse>(
    `/v1/invites/${encodeURIComponent(inviteId)}/accept`,
    { method: 'POST' },
  );
}

/** Owner lists invites for the members panel. */
export async function listServerInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
  if (!isApiConfigured()) return [];
  const res = await apiFetch<{ invites: Array<WorkspaceInvite & { status?: string }> }>(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/invites`,
  );
  return (res.invites || []).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    createdAt: i.createdAt,
  }));
}
