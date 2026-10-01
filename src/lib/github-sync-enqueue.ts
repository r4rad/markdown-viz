import { apiFetch, isApiConfigured } from './api-client';
import type { SyncJob } from '../types';

/** Default quiet settle before SPA asks the API to enqueue a SyncJob (~30s). */
export const SYNC_QUIET_SETTLE_MS = 30_000;

export type EnqueueSyncJobResponse = SyncJob;

/**
 * Ask Cloud Run to enqueue a SyncJob (Cloud Tasks commits after quietUntil).
 * No-op when API is not configured.
 */
export async function enqueueGithubSyncJob(
  documentId: string,
  workspaceId: string,
): Promise<EnqueueSyncJobResponse | null> {
  if (!isApiConfigured()) return null;
  if (!documentId || !workspaceId || workspaceId === 'personal') return null;

  return apiFetch<EnqueueSyncJobResponse>('/v1/sync/enqueue', {
    method: 'POST',
    body: JSON.stringify({ documentId, workspaceId }),
  });
}

/**
 * Pure helper: whether the SPA should schedule a sync enqueue for this edit context.
 */
export function shouldScheduleSyncEnqueue(input: {
  apiConfigured: boolean;
  workspaceId: string | null | undefined;
  role: string | null | undefined;
  documentId: string | null | undefined;
}): boolean {
  if (!input.apiConfigured) return false;
  if (!input.documentId) return false;
  if (!input.workspaceId || input.workspaceId === 'personal') return false;
  return input.role === 'owner' || input.role === 'editor';
}
