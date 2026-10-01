/** Matches packages/domain Conflict — local copy so services/api stays dependency-light. */

export type SyncStatus = 'InSync' | 'Ahead' | 'Behind' | 'Conflict';

export type ConflictStatus = 'open' | 'resolved';
export type ConflictResolution = 'local' | 'remote' | 'merged';

export type Conflict = {
  id: string;
  documentId: string;
  workspaceId: string;
  baseSha: string;
  localChecksum: string;
  remoteSha: string;
  status: ConflictStatus;
  resolution?: ConflictResolution;
};

/** Server-side conflict record with three-way contents for resolve UX. */
export type ConflictRecord = Conflict & {
  path: string;
  baseContent: string;
  localContent: string;
  remoteContent: string;
  conflictedPreview: string;
  createdAt: number;
  resolvedAt?: number;
};

/** Per-document GitHub sync mirror state. */
export type DocumentSyncState = {
  documentId: string;
  workspaceId: string;
  path: string;
  syncStatus: SyncStatus;
  baseContent: string;
  baseSha: string;
  localContent: string;
  localChecksum: string;
  remoteContent: string;
  remoteSha: string;
  openConflictId?: string;
  updatedAt: number;
};
