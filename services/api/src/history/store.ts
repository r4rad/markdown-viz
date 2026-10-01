import type { HistoryRecord } from './types.js';

/**
 * Document history persistence for Cloud Run.
 * Default is in-memory (local/CI). Production swaps in Firestore metadata +
 * Cloud Storage blobs (`history/{ws}/{doc}/{eventId}.snap.zst`).
 * Clients never mutate history; only Admin/backend appends.
 */
export interface HistoryStore {
  append(row: HistoryRecord): Promise<HistoryRecord>;
  get(id: string): Promise<HistoryRecord | null>;
  list(workspaceId: string, documentId: string): Promise<HistoryRecord[]>;
}

export function createMemoryHistoryStore(): HistoryStore {
  const rows = new Map<string, HistoryRecord>();

  return {
    async append(row) {
      rows.set(row.id, { ...row });
      return { ...row };
    },
    async get(id) {
      const row = rows.get(id);
      return row ? { ...row } : null;
    },
    async list(workspaceId, documentId) {
      return [...rows.values()]
        .filter((r) => r.workspaceId === workspaceId && r.documentId === documentId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((r) => ({ ...r }));
    },
  };
}

let defaultStore: HistoryStore = createMemoryHistoryStore();

export function getHistoryStore(): HistoryStore {
  return defaultStore;
}

export function setHistoryStore(store: HistoryStore): void {
  defaultStore = store;
}
