import type { Role } from './types';

export function canReadWorkspace(isMember: boolean): boolean {
  return isMember;
}

export function canWriteWorkspace(role: Role | null | undefined): boolean {
  return role === 'owner' || role === 'editor';
}

/** Comment threads: owner, editor, commentator — not viewer. */
export function canCommentWorkspace(role: Role | null | undefined): boolean {
  return role === 'owner' || role === 'editor' || role === 'commentator';
}

export function canManageMembers(role: Role | null | undefined): boolean {
  return role === 'owner';
}

export function canRestoreVersion(role: Role | null | undefined): boolean {
  return canWriteWorkspace(role);
}

export function canSyncWiki(role: Role | null | undefined): boolean {
  return canWriteWorkspace(role);
}

export function canReadActivity(
  role: Role | null | undefined,
  actorId: string,
  authUid: string,
): boolean {
  if (role === 'owner') return true;
  return actorId === authUid;
}

export function canQueryWorkspaceActivity(role: Role | null | undefined): boolean {
  return role === 'owner';
}

export function activityCreateAllowed(authUid: string, actorId: string | 'unknown'): boolean {
  return actorId === authUid;
}

export function isWorkspaceMember(members: Array<{ uid: string }>, uid: string): boolean {
  return members.some(m => m.uid === uid);
}
