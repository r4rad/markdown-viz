/** Matches packages/domain SyncJob — kept local so services/api stays dependency-light. */
export type SyncJobState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked_conflict';

export type SyncJob = {
  id: string;
  documentId: string;
  workspaceId: string;
  state: SyncJobState;
  quietUntil: number;
  attempt: number;
};

export type EnqueueSyncBody = {
  documentId: string;
  workspaceId: string;
};

/** Result of a GitHub App commit attempt. */
export type SyncCommitResult = {
  sha: string;
};

export type TransientSyncError = Error & { transient: true };

export function isTransientSyncError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { transient?: unknown }).transient === true;
}

export function transientError(message: string): TransientSyncError {
  const err = new Error(message) as TransientSyncError;
  err.transient = true;
  return err;
}
