/**
 * Pure mirror of workspace ACL decisions in firestore.rules.
 * Used by unit tests as the emulator-equivalent matrix when the Firestore
 * emulator (Java) is not available in the local/CI environment.
 */
import type { Role } from '../types';

export type RulesRole = Role; // owner | editor | commentator | viewer

export function rulesCanEditBody(role: RulesRole | null | undefined): boolean {
  return role === 'owner' || role === 'editor';
}

export function rulesCanComment(role: RulesRole | null | undefined): boolean {
  return role === 'owner' || role === 'editor' || role === 'commentator';
}

/** Non-owners cannot mutate membership docs. */
export function rulesCanMutateMembership(role: RulesRole | null | undefined): boolean {
  return role === 'owner';
}

/** Ownership transfer is not allowed from clients (Admin/Cloud Run only). */
export function rulesCanTransferOwnershipFromClient(
  actorIsOwner: boolean,
  ownerIdChanging: boolean,
): boolean {
  if (!actorIsOwner) return false;
  if (ownerIdChanging) return false;
  return true;
}

/**
 * syncJobs, repoLinks, history (incl. compaction), conflicts, invites:
 * client writes denied; Admin SDK / Cloud Run only.
 */
export function rulesClientCanWriteBackendManagedCollection(
  collection: 'repoLinks' | 'syncJobs' | 'history' | 'conflicts' | 'invites',
): boolean {
  void collection;
  return false;
}

/** Non-owners cannot self-assign a role via members/{ownUid}. */
export function rulesClientCanSelfEnrollMembership(
  actorIsOwner: boolean,
  targetUidIsSelf: boolean,
  requestedRole: RulesRole,
): boolean {
  if (!actorIsOwner) return false;
  if (targetUidIsSelf) return requestedRole === 'owner';
  return true;
}

export function rulesClientCanWriteWorkspaceFile(role: RulesRole | null | undefined): boolean {
  return rulesCanEditBody(role);
}
