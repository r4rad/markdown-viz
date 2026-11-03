import { apiFetch, isApiConfigured } from './api-client';
import type { Conflict, ConflictResolution, FileTab, SyncStatus, WorkspaceFolder } from '../types';

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
      return 'InSync';
    default:
      return 'Off';
  }
}

/** True when this tab is actually mirrored to GitHub (not a personal scratch file). */
export function tabHasGithubMirror(
  tab: FileTab | null | undefined,
  folders: WorkspaceFolder[] = [],
): boolean {
  if (!tab) return false;
  if (tab.origin.kind === 'github') return true;
  if (!tab.folderId) return false;
  return !!folders.find((f) => f.id === tab.folderId)?.repoLink;
}

/**
 * Badge text for the status bar. Unlinked local docs must not claim InSync.
 * Without Cloud Run API config, only an open Conflict is still shown.
 */
export function githubSyncBadgeLabel(
  tab: FileTab | null | undefined,
  folders: WorkspaceFolder[] = [],
  apiConfigured = isApiConfigured(),
): string {
  if (!tab) return 'Off';
  if (tab.syncStatus === 'Conflict') return 'Conflict';
  if (!tabHasGithubMirror(tab, folders)) return 'Off';
  if (!apiConfigured) return 'Off';
  return syncStatusLabel(tab.syncStatus ?? 'InSync');
}
