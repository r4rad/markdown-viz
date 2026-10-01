import { apiFetch, isApiConfigured } from './api-client';
import type { Conflict, ConflictResolution, SyncStatus } from '../types';

export type ResolveConflictResponse = {
  conflict: Conflict;
  document: {
    documentId: string;
    workspaceId: string;
    syncStatus: SyncStatus;
    localContent: string;
    openConflictId: string | null;
  };
};

export type ConflictPreview = {
  id: string;
  documentId: string;
  workspaceId: string;
  localContent: string;
  remoteContent: string;
  baseContent: string;
  conflictedPreview: string;
};

/**
 * Resolve an open Conflict via Cloud Run (keep-local / take-remote / merged).
 */
export async function resolveGithubConflict(
  conflictId: string,
  resolution: ConflictResolution,
  mergedContent?: string,
): Promise<ResolveConflictResponse | null> {
  if (!isApiConfigured()) return null;
  if (!conflictId) return null;

  const body: { resolution: ConflictResolution; mergedContent?: string } = {
    resolution,
  };
  if (resolution === 'merged') {
    body.mergedContent = mergedContent ?? '';
  }

  return apiFetch<ResolveConflictResponse>(
    `/v1/conflicts/${encodeURIComponent(conflictId)}/resolve`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

/** Map API resolution names to UI action labels. */
export function resolutionFromAction(
  action: 'keep-local' | 'take-remote' | 'merged',
): ConflictResolution {
  if (action === 'keep-local') return 'local';
  if (action === 'take-remote') return 'remote';
  return 'merged';
}

export function syncStatusLabel(status: SyncStatus | undefined | null): string {
  switch (status) {
    case 'Ahead':
      return 'Ahead';
    case 'Behind':
      return 'Behind';
    case 'Conflict':
      return 'Conflict';
    case 'InSync':
    default:
      return 'InSync';
  }
}
