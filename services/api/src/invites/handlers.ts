import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../middleware/auth.js';
import { getInviteStore, type InviteStore } from './store.js';
import { isInviteRole, type WorkspaceInvite } from './types.js';

export type HandlerFail = { ok: false; status: number; error: string };
export type CreateInviteOk = {
  ok: true;
  invite: WorkspaceInvite;
  acceptPath: string;
};
export type AcceptInviteOk = {
  ok: true;
  workspaceId: string;
  role: WorkspaceInvite['role'];
  membershipUid: string;
};
export type ListInvitesOk = { ok: true; invites: WorkspaceInvite[] };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createInvite(
  user: AuthUser,
  body: unknown,
  store: InviteStore = getInviteStore(),
): Promise<CreateInviteOk | HandlerFail> {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'invalid_body' };
  }
  const { workspaceId, email, role } = body as Record<string, unknown>;
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) {
    return { ok: false, status: 400, error: 'workspace_id_required' };
  }
  if (typeof email !== 'string' || !email.includes('@')) {
    return { ok: false, status: 400, error: 'email_required' };
  }
  if (!isInviteRole(role)) {
    return { ok: false, status: 400, error: 'invalid_role' };
  }

  const wsId = workspaceId.trim();
  // Until Firestore Admin syncs ownership, bootstrap: first creator becomes owner in the API store.
  if (!(await store.isOwner(wsId, user.uid))) {
    if (await store.hasOwner(wsId)) {
      return { ok: false, status: 403, error: 'owner_required' };
    }
    await store.setOwner(wsId, user.uid);
  }

  const invite: WorkspaceInvite = {
    id: randomUUID(),
    workspaceId: wsId,
    email: normalizeEmail(email),
    role,
    createdBy: user.uid,
    createdAt: Date.now(),
    status: 'pending',
  };
  await store.createInvite(invite);
  return { ok: true, invite, acceptPath: `/invite/${invite.id}` };
}

export async function acceptInvite(
  user: AuthUser,
  inviteId: string,
  store: InviteStore = getInviteStore(),
): Promise<AcceptInviteOk | HandlerFail> {
  if (!inviteId) {
    return { ok: false, status: 400, error: 'invite_id_required' };
  }
  const invite = await store.getInvite(inviteId);
  if (!invite || invite.status !== 'pending') {
    return { ok: false, status: 404, error: 'invite_not_found' };
  }

  const email = user.email?.trim().toLowerCase();
  if (!email) {
    return { ok: false, status: 403, error: 'email_required_on_token' };
  }
  if (email !== invite.email) {
    // Spec: email mismatch → 403; invite remains pending.
    return { ok: false, status: 403, error: 'invite_email_mismatch' };
  }

  await store.putMembership({
    workspaceId: invite.workspaceId,
    uid: user.uid,
    email,
    role: invite.role,
    addedAt: Date.now(),
  });
  await store.updateInvite({ ...invite, status: 'accepted' });
  return {
    ok: true,
    workspaceId: invite.workspaceId,
    role: invite.role,
    membershipUid: user.uid,
  };
}

export async function listWorkspaceInvites(
  user: AuthUser,
  workspaceId: string,
  store: InviteStore = getInviteStore(),
): Promise<ListInvitesOk | HandlerFail> {
  if (!workspaceId) {
    return { ok: false, status: 400, error: 'workspace_id_required' };
  }
  const owner = await store.isOwner(workspaceId, user.uid);
  if (!owner) {
    return { ok: false, status: 403, error: 'owner_required' };
  }
  const invites = await store.listInvites(workspaceId);
  return { ok: true, invites };
}
