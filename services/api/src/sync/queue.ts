/**
 * Cloud Tasks abstraction for delayed SyncJob runs.
 * Memory queue for local/CI; production swaps in Cloud Tasks client.
 */

export type SyncTaskQueue = {
  /** Schedule (or reschedule) a run for jobId at runAt (epoch ms). */
  scheduleRun(jobId: string, runAt: number): Promise<void>;
  /** Cancel a pending schedule for jobId (no-op if none). */
  cancel(jobId: string): Promise<void>;
};

export type MemoryQueueOptions = {
  now?: () => number;
  /** Delay timer; tests may inject a no-op or sync runner. */
  schedule?: (fn: () => void, delayMs: number) => { clear: () => void };
};

export type SyncJobRunner = (jobId: string) => Promise<void>;

export function createMemorySyncTaskQueue(
  runner: SyncJobRunner,
  options: MemoryQueueOptions = {},
): SyncTaskQueue {
  const now = options.now ?? (() => Date.now());
  const schedule =
    options.schedule ??
    ((fn, delayMs) => {
      const handle = setTimeout(fn, Math.max(0, delayMs));
      return { clear: () => clearTimeout(handle) };
    });

  const pending = new Map<string, { clear: () => void }>();

  return {
    async scheduleRun(jobId, runAt) {
      const prev = pending.get(jobId);
      if (prev) prev.clear();

      const delay = Math.max(0, runAt - now());
      const handle = schedule(() => {
        pending.delete(jobId);
        void runner(jobId).catch((err: unknown) => {
          console.error('[sync-queue] run failed', jobId, err);
        });
      }, delay);
      pending.set(jobId, handle);
    },
    async cancel(jobId) {
      const prev = pending.get(jobId);
      if (prev) {
        prev.clear();
        pending.delete(jobId);
      }
    },
  };
}

let defaultQueue: SyncTaskQueue | null = null;

export function getSyncTaskQueue(): SyncTaskQueue {
  if (!defaultQueue) {
    throw new Error('sync_task_queue_not_configured');
  }
  return defaultQueue;
}

export function setSyncTaskQueue(queue: SyncTaskQueue): void {
  defaultQueue = queue;
}

export function resetSyncTaskQueue(): void {
  defaultQueue = null;
}
