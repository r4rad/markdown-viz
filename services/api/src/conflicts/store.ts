import type { ConflictRecord, DocumentSyncState } from './types.js';

/**
 * Conflict + document sync persistence for Cloud Run.
 * Default is in-memory (local/CI). Production swaps in Firestore Admin
 * (`workspaces/{wsId}/conflicts/{id}` + document syncStatus fields).
 */
export interface ConflictStore {
  createConflict(row: ConflictRecord): Promise<ConflictRecord>;
  updateConflict(row: ConflictRecord): Promise<ConflictRecord>;
  getConflict(id: string): Promise<ConflictRecord | null>;
  findOpenByDocument(
    workspaceId: string,
    documentId: string,
  ): Promise<ConflictRecord | null>;
  listConflicts(workspaceId: string): Promise<ConflictRecord[]>;
}

export interface DocumentSyncStore {
  upsert(state: DocumentSyncState): Promise<DocumentSyncState>;
  get(
    workspaceId: string,
    documentId: string,
  ): Promise<DocumentSyncState | null>;
  findByPath(
    workspaceId: string,
    path: string,
  ): Promise<DocumentSyncState | null>;
  list(workspaceId: string): Promise<DocumentSyncState[]>;
}

export function createMemoryConflictStore(): ConflictStore {
  const rows = new Map<string, ConflictRecord>();

  return {
    async createConflict(row) {
      rows.set(row.id, { ...row });
      return { ...row };
    },
    async updateConflict(row) {
      rows.set(row.id, { ...row });
      return { ...row };
    },
    async getConflict(id) {
      const row = rows.get(id);
      return row ? { ...row } : null;
    },
    async findOpenByDocument(workspaceId, documentId) {
      for (const row of rows.values()) {
        if (
          row.workspaceId === workspaceId &&
          row.documentId === documentId &&
          row.status === 'open'
        ) {
          return { ...row };
        }
      }
      return null;
    },
    async listConflicts(workspaceId) {
      return [...rows.values()]
        .filter((r) => r.workspaceId === workspaceId)
        .map((r) => ({ ...r }));
    },
  };
}

export function createMemoryDocumentSyncStore(): DocumentSyncStore {
  const rows = new Map<string, DocumentSyncState>();

  function key(workspaceId: string, documentId: string): string {
    return `${workspaceId}::${documentId}`;
  }

  return {
    async upsert(state) {
      rows.set(key(state.workspaceId, state.documentId), { ...state });
      return { ...state };
    },
    async get(workspaceId, documentId) {
      const row = rows.get(key(workspaceId, documentId));
      return row ? { ...row } : null;
    },
    async findByPath(workspaceId, path) {
      const normalized = path.replace(/^\/+/, '');
      for (const row of rows.values()) {
        if (
          row.workspaceId === workspaceId &&
          row.path.replace(/^\/+/, '') === normalized
        ) {
          return { ...row };
        }
      }
      return null;
    },
    async list(workspaceId) {
      return [...rows.values()]
        .filter((r) => r.workspaceId === workspaceId)
        .map((r) => ({ ...r }));
    },
  };
}

let defaultConflictStore: ConflictStore = createMemoryConflictStore();
let defaultDocSyncStore: DocumentSyncStore = createMemoryDocumentSyncStore();

export function getConflictStore(): ConflictStore {
  return defaultConflictStore;
}

export function setConflictStore(store: ConflictStore): void {
  defaultConflictStore = store;
}

export function resetConflictStore(): ConflictStore {
  defaultConflictStore = createMemoryConflictStore();
  return defaultConflictStore;
}

export function getDocumentSyncStore(): DocumentSyncStore {
  return defaultDocSyncStore;
}

export function setDocumentSyncStore(store: DocumentSyncStore): void {
  defaultDocSyncStore = store;
}

export function resetDocumentSyncStore(): DocumentSyncStore {
  defaultDocSyncStore = createMemoryDocumentSyncStore();
  return defaultDocSyncStore;
}
