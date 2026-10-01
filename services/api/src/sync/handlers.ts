import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../middleware/auth.js';
import { getInviteStore, type InviteStore } from '../invites/store.js';
import { getRepoLinkStore, type RepoLinkStore } from '../github/store.js';
import { rejectViteGithubAppSecrets } from '../github/config.js';
import {
  getGithubSyncCommitter,
  type GithubSyncCommitter,
} from './commit.js';
import {
  getConflictStore,
  type ConflictStore,
} from '../conflicts/store.js';
import { getSyncJobStore, type SyncJobStore } from './store.js';
import { getSyncTaskQueue, type SyncTaskQueue } from './queue.js';
import {
  isTransientSyncError,
  type SyncJob,
} from './types.js';

export type HandlerFail = { ok: false; status: number; error: string };
export type EnqueueOk = { ok: true; job: SyncJob };
export type RunOk = { ok: true; job: SyncJob; sha?: string };

const DEFAULT_QUIET_MS = 30_000;
const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 2_000;

export function getQuietPeriodMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SYNC_QUIET_PERIOD_MS;
  if (raw === undefined || raw === '') return DEFAULT_QUIET_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_QUIET_MS;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** editor+ — mirrors domain canSyncWiki / canWriteWorkspace. */
async function resolveEditorPlusRole(
  store: InviteStore,
  workspaceId: string,
  uid: string,
): Promise<'owner' | 'editor' | null> {
  if (await store.isOwner(workspaceId, uid)) return 'owner';
  const membership = await store.getMembership(workspaceId, uid);
  if (membership?.role === 'owner' || membership?.role === 'editor') {
    return membership.role;
  }
  return null;
}

/**
 * Editor+ schedules a SyncJob; Cloud Tasks runs it after ~30s quiet.
 * Repeated enqueue for the same document coalesces and extends quietUntil.
 */
export async function enqueueSyncJob(
  user: AuthUser,
  body: unknown,
  deps: {
    jobStore?: SyncJobStore;
    inviteStore?: InviteStore;
    conflictStore?: ConflictStore;
    queue?: SyncTaskQueue;
    now?: () => number;
    quietMs?: number;
  } = {},
): Promise<EnqueueOk | HandlerFail> {
  const viteCheck = rejectViteGithubAppSecrets();
  if (!viteCheck.ok) {
    return { ok: false, status: 500, error: 'vite_github_secrets_forbidden' };
  }

  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'invalid_body' };
  }
  const { documentId, workspaceId } = body as Record<string, unknown>;
  if (!isNonEmptyString(documentId)) {
    return { ok: false, status: 400, error: 'document_id_required' };
  }
  if (!isNonEmptyString(workspaceId)) {
    return { ok: false, status: 400, error: 'workspace_id_required' };
  }

  const wsId = workspaceId.trim();
  const docId = documentId.trim();
  const inviteStore = deps.inviteStore ?? getInviteStore();
  const role = await resolveEditorPlusRole(inviteStore, wsId, user.uid);
  if (!role) {
    return { ok: false, status: 403, error: 'editor_required' };
  }

  const conflictStore = deps.conflictStore ?? getConflictStore();
  const openConflict = await conflictStore.findOpenByDocument(wsId, docId);
  if (openConflict) {
    return { ok: false, status: 409, error: 'blocked_conflict' };
  }

  const jobStore = deps.jobStore ?? getSyncJobStore();
  const queue = deps.queue ?? getSyncTaskQueue();
  const now = deps.now ?? (() => Date.now());
  const quietMs = deps.quietMs ?? getQuietPeriodMs();
  const quietUntil = now() + quietMs;

  const existing = await jobStore.findActiveByDocument(wsId, docId);
  if (existing && existing.state === 'queued') {
    const updated: SyncJob = { ...existing, quietUntil };
    await jobStore.updateJob(updated);
    await queue.scheduleRun(updated.id, quietUntil);
    return { ok: true, job: updated };
  }

  const job: SyncJob = {
    id: randomUUID(),
    documentId: docId,
    workspaceId: wsId,
    state: 'queued',
    quietUntil,
    attempt: 0,
  };
  await jobStore.createJob(job);
  await queue.scheduleRun(job.id, quietUntil);
  return { ok: true, job };
}

/**
 * Cloud Tasks callback: commit via GitHub App after quiet period.
 * Transient failures re-enqueue via the task queue (Cloud Tasks retry).
 */
export async function runSyncJob(
  jobId: string,
  deps: {
    jobStore?: SyncJobStore;
    repoStore?: RepoLinkStore;
    queue?: SyncTaskQueue;
    committer?: GithubSyncCommitter;
    now?: () => number;
  } = {},
): Promise<RunOk | HandlerFail> {
  const viteCheck = rejectViteGithubAppSecrets();
  if (!viteCheck.ok) {
    return { ok: false, status: 500, error: 'vite_github_secrets_forbidden' };
  }

  if (!isNonEmptyString(jobId)) {
    return { ok: false, status: 400, error: 'job_id_required' };
  }

  const jobStore = deps.jobStore ?? getSyncJobStore();
  const repoStore = deps.repoStore ?? getRepoLinkStore();
  const queue = deps.queue ?? getSyncTaskQueue();
  const committer = deps.committer ?? getGithubSyncCommitter();
  const now = deps.now ?? (() => Date.now());

  const job = await jobStore.getJob(jobId.trim());
  if (!job) {
    return { ok: false, status: 404, error: 'job_not_found' };
  }
  if (job.state === 'succeeded' || job.state === 'blocked_conflict') {
    return { ok: true, job };
  }
  if (job.state === 'failed' && job.attempt >= MAX_ATTEMPTS) {
    return { ok: true, job };
  }

  // Still in quiet window (coalesced enqueue extended quietUntil).
  if (job.state === 'queued' && now() < job.quietUntil) {
    await queue.scheduleRun(job.id, job.quietUntil);
    return { ok: true, job };
  }

  const running: SyncJob = { ...job, state: 'running' };
  await jobStore.updateJob(running);

  const links = await repoStore.listLinks(job.workspaceId);
  if (links.length === 0) {
    const failed: SyncJob = { ...running, state: 'failed', attempt: running.attempt + 1 };
    await jobStore.updateJob(failed);
    return { ok: false, status: 409, error: 'repo_link_required' };
  }

  try {
    const result = await committer.commit(running, links[0]!);
    const succeeded: SyncJob = {
      ...running,
      state: 'succeeded',
      attempt: running.attempt + 1,
    };
    await jobStore.updateJob(succeeded);
    return { ok: true, job: succeeded, sha: result.sha };
  } catch (err) {
    const attempt = running.attempt + 1;
    if (isTransientSyncError(err) && attempt < MAX_ATTEMPTS) {
      const retryAt = now() + RETRY_BACKOFF_MS * attempt;
      const queued: SyncJob = {
        ...running,
        state: 'queued',
        attempt,
        quietUntil: retryAt,
      };
      await jobStore.updateJob(queued);
      await queue.scheduleRun(queued.id, retryAt);
      return { ok: true, job: queued };
    }

    const failed: SyncJob = {
      ...running,
      state: 'failed',
      attempt,
    };
    await jobStore.updateJob(failed);
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : 'github_commit_failed',
    };
  }
}

/**
 * Authenticate Cloud Tasks → API callback.
 * Uses SYNC_TASKS_SECRET header when configured; stub mode allows missing secret in local/CI.
 */
export function authorizeSyncTaskRequest(
  headers: Record<string, string | string[] | undefined>,
  env: NodeJS.ProcessEnv = process.env,
): HandlerFail | { ok: true } {
  const expected = (env.SYNC_TASKS_SECRET ?? '').trim();
  if (!expected) {
    // Local/CI without a shared secret — memory queue calls handlers in-process.
    return { ok: true };
  }
  const raw = headers['x-sync-task-secret'];
  const provided = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (provided !== expected) {
    return { ok: false, status: 401, error: 'invalid_task_secret' };
  }
  return { ok: true };
}
