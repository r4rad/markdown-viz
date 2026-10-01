import { on } from './events';
import { getState, getActiveTab } from './state';
import { isApiConfigured } from './api-client';
import {
  enqueueGithubSyncJob,
  shouldScheduleSyncEnqueue,
  SYNC_QUIET_SETTLE_MS,
} from './github-sync-enqueue';

let settleTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * After cloud edits settle for ~30s, enqueue a SyncJob (API adds Cloud Tasks quiet).
 */
export function setupQuietSyncEnqueue(
  options: {
    settleMs?: number;
    enqueue?: typeof enqueueGithubSyncJob;
  } = {},
): () => void {
  const settleMs = options.settleMs ?? SYNC_QUIET_SETTLE_MS;
  const enqueue = options.enqueue ?? enqueueGithubSyncJob;

  const schedule = () => {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      const state = getState();
      const tab = getActiveTab();
      if (
        !shouldScheduleSyncEnqueue({
          apiConfigured: isApiConfigured(),
          workspaceId: state.activeWorkspaceId,
          role: state.currentRole,
          documentId: tab?.id,
        })
      ) {
        return;
      }
      void enqueue(tab!.id, state.activeWorkspaceId).catch((err: unknown) => {
        console.error('[quiet-sync-enqueue]', err);
      });
    }, settleMs);
  };

  const offContent = on('content-changed', schedule);
  const offState = on('state-changed', schedule);

  return () => {
    offContent();
    offState();
    if (settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = null;
    }
  };
}
