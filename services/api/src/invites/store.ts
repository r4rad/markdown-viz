import type { WorkspaceInvite, WorkspaceMembership } from './types.js';

/**
 * Invite + membership persistence for Cloud Run.
 * Default is in-memory (local/CI). Production swaps in Firestore Admin.
 */
export interface InviteStore {
  createInvite(invite: WorkspaceInvite): Promise<WorkspaceInvite>;
  getInvite(id: string): Promise<WorkspaceInvite | null>;
  updateInvite(invite: WorkspaceInvite): Promise<void>;
  listInvites(workspaceId: string): Promise<WorkspaceInvite[]>;
  putMembership(member: WorkspaceMembership): Promise<void>;
  getMembership(workspaceId: string, uid: string): Promise<WorkspaceMembership | null>;
  /** Stub/prod seed: mark a uid as workspace owner for create authorization. */
  setOwner(workspaceId: string, ownerUid: string): Promise<void>;
  isOwner(workspaceId: string, uid: string): Promise<boolean>;
  hasOwner(workspaceId: string): Promise<boolean>;
}

export function createMemoryInviteStore(): InviteStore {
  const invites = new Map<string, WorkspaceInvite>();
  const members = new Map<string, WorkspaceMembership>();
  const owners = new Map<string, string>();

  const memberKey = (workspaceId: string, uid: string) => `${workspaceId}:${uid}`;

  return {
    async createInvite(invite) {
      invites.set(invite.id, { ...invite });
      return { ...invite };
    },
    async getInvite(id) {
      const row = invites.get(id);
      return row ? { ...row } : null;
    },
    async updateInvite(invite) {
      invites.set(invite.id, { ...invite });
    },
    async listInvites(workspaceId) {
      return [...invites.values()]
        .filter((i) => i.workspaceId === workspaceId)
        .map((i) => ({ ...i }));
    },
    async putMembership(member) {
      members.set(memberKey(member.workspaceId, member.uid), { ...member });
    },
    async getMembership(workspaceId, uid) {
      const row = members.get(memberKey(workspaceId, uid));
      return row ? { ...row } : null;
    },
    async setOwner(workspaceId, ownerUid) {
      owners.set(workspaceId, ownerUid);
      members.set(memberKey(workspaceId, ownerUid), {
        workspaceId,
        uid: ownerUid,
        email: null,
        role: 'owner',
        addedAt: Date.now(),
      });
    },
    async isOwner(workspaceId, uid) {
      if (owners.get(workspaceId) === uid) return true;
      const m = members.get(memberKey(workspaceId, uid));
      return m?.role === 'owner';
    },
    async hasOwner(workspaceId) {
      if (owners.has(workspaceId)) return true;
      for (const m of members.values()) {
        if (m.workspaceId === workspaceId && m.role === 'owner') return true;
      }
      return false;
    },
  };
}

/** Process-wide default store (tests may replace via createServer options). */
let defaultStore: InviteStore = createMemoryInviteStore();

export function getInviteStore(): InviteStore {
  return defaultStore;
}

export function setInviteStore(store: InviteStore): void {
  defaultStore = store;
}

export function resetInviteStore(): InviteStore {
  defaultStore = createMemoryInviteStore();
  return defaultStore;
}
