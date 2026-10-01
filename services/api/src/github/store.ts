import type { RepositoryLink } from './types.js';

/**
 * RepositoryLink persistence for Cloud Run.
 * Default is in-memory (local/CI). Production swaps in Firestore Admin
 * (`workspaces/{wsId}/repoLinks/{id}`).
 */
export interface RepoLinkStore {
  createLink(link: RepositoryLink): Promise<RepositoryLink>;
  getLink(id: string): Promise<RepositoryLink | null>;
  listLinks(workspaceId: string): Promise<RepositoryLink[]>;
}

export function createMemoryRepoLinkStore(): RepoLinkStore {
  const links = new Map<string, RepositoryLink>();

  return {
    async createLink(link) {
      links.set(link.id, { ...link });
      return { ...link };
    },
    async getLink(id) {
      const row = links.get(id);
      return row ? { ...row } : null;
    },
    async listLinks(workspaceId) {
      return [...links.values()]
        .filter((l) => l.workspaceId === workspaceId)
        .map((l) => ({ ...l }));
    },
  };
}

let defaultStore: RepoLinkStore = createMemoryRepoLinkStore();

export function getRepoLinkStore(): RepoLinkStore {
  return defaultStore;
}

export function setRepoLinkStore(store: RepoLinkStore): void {
  defaultStore = store;
}

export function resetRepoLinkStore(): RepoLinkStore {
  defaultStore = createMemoryRepoLinkStore();
  return defaultStore;
}
