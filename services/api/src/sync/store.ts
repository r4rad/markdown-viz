import type { SyncJob } from './types.js';

/**
 * SyncJob persistence for Cloud Run.
 * Default is in-memory (local/CI). Production swaps in Firestore Admin
 * (`workspaces/{wsId}/syncJobs/{id}`).
 */
export interface SyncJobStore {
  createJob(job: SyncJob): Promise<SyncJob>;
  updateJob(job: SyncJob): Promise<SyncJob>;
  getJob(id: string): Promise<SyncJob | null>;
  /** Latest queued (or running) job for a document, if any. */
  findActiveByDocument(
    workspaceId: string,
    documentId: string,
  ): Promise<SyncJob | null>;
  listJobs(workspaceId: string): Promise<SyncJob[]>;
}

export function createMemorySyncJobStore(): SyncJobStore {
  const jobs = new Map<string, SyncJob>();

  return {
    async createJob(job) {
      jobs.set(job.id, { ...job });
      return { ...job };
    },
    async updateJob(job) {
      jobs.set(job.id, { ...job });
      return { ...job };
    },
    async getJob(id) {
      const row = jobs.get(id);
      return row ? { ...row } : null;
    },
    async findActiveByDocument(workspaceId, documentId) {
      let best: SyncJob | null = null;
      for (const job of jobs.values()) {
        if (job.workspaceId !== workspaceId || job.documentId !== documentId) continue;
        if (job.state !== 'queued' && job.state !== 'running') continue;
        if (!best || job.quietUntil >= best.quietUntil) best = job;
      }
      return best ? { ...best } : null;
    },
    async listJobs(workspaceId) {
      return [...jobs.values()]
        .filter((j) => j.workspaceId === workspaceId)
        .map((j) => ({ ...j }));
    },
  };
}

let defaultStore: SyncJobStore = createMemorySyncJobStore();

export function getSyncJobStore(): SyncJobStore {
  return defaultStore;
}

export function setSyncJobStore(store: SyncJobStore): void {
  defaultStore = store;
}

export function resetSyncJobStore(): SyncJobStore {
  defaultStore = createMemorySyncJobStore();
  return defaultStore;
}
