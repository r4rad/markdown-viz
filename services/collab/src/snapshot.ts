import * as Y from 'yjs';

export type SnapshotRecord = {
  documentId: string;
  snapshot: Uint8Array;
  updatedAt: number;
  clientCount: number;
};

/**
 * Persist snapshot stub — in-memory for local/CI.
 * Production will write to Firestore / Cloud Storage (history blobs).
 */
const store = new Map<string, SnapshotRecord>();

export function persistSnapshotStub(
  documentId: string,
  ydoc: Y.Doc,
  clientCount: number,
): SnapshotRecord {
  const record: SnapshotRecord = {
    documentId,
    snapshot: Y.encodeStateAsUpdate(ydoc),
    updatedAt: Date.now(),
    clientCount,
  };
  store.set(documentId, record);
  return record;
}

export function getSnapshotStub(documentId: string): SnapshotRecord | undefined {
  return store.get(documentId);
}

export function clearSnapshotStubs(): void {
  store.clear();
}
