import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { createServer } from '../src/app.js';
import { createMemoryInviteStore, setInviteStore, type InviteStore } from '../src/invites/store.js';
import {
  createMemoryRepoLinkStore,
  setRepoLinkStore,
  type RepoLinkStore,
} from '../src/github/store.js';
import {
  createMemorySyncJobStore,
  setSyncJobStore,
  type SyncJobStore,
} from '../src/sync/store.js';
import { setSyncTaskQueue, type SyncTaskQueue } from '../src/sync/queue.js';
import {
  createStubGithubSyncCommitter,
  setGithubSyncCommitter,
} from '../src/sync/commit.js';
import { FORBIDDEN_VITE_GITHUB_SECRET_KEYS } from '../src/github/config.js';
import { enqueueSyncJob, runSyncJob } from '../src/sync/handlers.js';

describe('SyncJob quiet-period enqueue + Cloud Tasks commit', () => {
  let server: http.Server;
  let baseUrl: string;
  let inviteStore: InviteStore;
  let repoStore: RepoLinkStore;
  let jobStore: SyncJobStore;
  let committer: ReturnType<typeof createStubGithubSyncCommitter>;
  let clock = 1_000_000;
  let pending: Array<{ jobId: string; runAt: number }>;
  const prevQuiet = process.env.SYNC_QUIET_PERIOD_MS;
  const prevSecret = process.env.SYNC_TASKS_SECRET;
  const clearedVite: Array<{ key: string; value: string | undefined }> = [];

  function makeQueue(): SyncTaskQueue {
    return {
      async scheduleRun(jobId, runAt) {
        pending = pending.filter((p) => p.jobId !== jobId);
        pending.push({ jobId, runAt });
      },
      async cancel(jobId) {
        pending = pending.filter((p) => p.jobId !== jobId);
      },
    };
  }

  async function flushDue(): Promise<void> {
    let progressed = true;
    while (progressed) {
      progressed = false;
      const due = pending.filter((p) => p.runAt <= clock);
      pending = pending.filter((p) => p.runAt > clock);
      for (const p of due) {
        await runSyncJob(p.jobId, {
          jobStore,
          repoStore,
          committer,
          now: () => clock,
          queue: makeQueue(),
        });
        progressed = true;
      }
    }
  }

  beforeAll(async () => {
    for (const key of FORBIDDEN_VITE_GITHUB_SECRET_KEYS) {
      clearedVite.push({ key, value: process.env[key] });
      delete process.env[key];
    }
    process.env.SYNC_QUIET_PERIOD_MS = '30000';
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY =
      '-----BEGIN RSA PRIVATE KEY-----\nstub\n-----END RSA PRIVATE KEY-----';

    inviteStore = createMemoryInviteStore();
    repoStore = createMemoryRepoLinkStore();
    jobStore = createMemorySyncJobStore();
    committer = createStubGithubSyncCommitter();
    pending = [];
    setInviteStore(inviteStore);
    setRepoLinkStore(repoStore);
    setSyncJobStore(jobStore);
    setGithubSyncCommitter(committer);
    setSyncTaskQueue(makeQueue());

    server = createServer({
      inviteStore,
      repoLinkStore: repoStore,
      syncJobStore: jobStore,
      githubSyncCommitter: committer,
      syncTaskQueue: makeQueue(),
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  beforeEach(async () => {
    clock = 1_000_000;
    pending = [];
    inviteStore = createMemoryInviteStore();
    repoStore = createMemoryRepoLinkStore();
    jobStore = createMemorySyncJobStore();
    committer = createStubGithubSyncCommitter();
    setInviteStore(inviteStore);
    setRepoLinkStore(repoStore);
    setSyncJobStore(jobStore);
    setGithubSyncCommitter(committer);
    setSyncTaskQueue(makeQueue());

    await inviteStore.setOwner('ws-1', 'alice');
    await inviteStore.putMembership({
      workspaceId: 'ws-1',
      uid: 'ed',
      email: 'ed@example.com',
      role: 'editor',
      addedAt: 1,
    });
    await inviteStore.putMembership({
      workspaceId: 'ws-1',
      uid: 'view',
      email: 'v@example.com',
      role: 'viewer',
      addedAt: 1,
    });
    await repoStore.createLink({
      id: 'link-1',
      workspaceId: 'ws-1',
      installationId: 7,
      owner: 'acme',
      repo: 'docs',
      syncBranch: 'markdownviz/sync',
      pathPrefix: 'wiki',
    });
    for (const key of FORBIDDEN_VITE_GITHUB_SECRET_KEYS) {
      delete process.env[key];
    }
    process.env.SYNC_QUIET_PERIOD_MS = '30000';
    delete process.env.SYNC_TASKS_SECRET;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    restoreEnv('SYNC_QUIET_PERIOD_MS', prevQuiet);
    restoreEnv('SYNC_TASKS_SECRET', prevSecret);
    for (const { key, value } of clearedVite) {
      restoreEnv(key, value);
    }
  });

  async function postJson(path: string, token: string | null, body: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  it('enqueues SyncJob with ~30s quietUntil for editor+', async () => {
    const res = await postJson('/v1/sync/enqueue', 'stub:ed', {
      workspaceId: 'ws-1',
      documentId: 'doc-1',
    });
    expect(res.status).toBe(202);
    const job = (await res.json()) as {
      id: string;
      state: string;
      quietUntil: number;
      attempt: number;
      documentId: string;
      workspaceId: string;
    };
    expect(job.state).toBe('queued');
    expect(job.documentId).toBe('doc-1');
    expect(job.workspaceId).toBe('ws-1');
    expect(job.attempt).toBe(0);
    // Handler uses Date.now() by default via HTTP path — assert relative quiet window.
    expect(job.quietUntil).toBeGreaterThan(Date.now() + 25_000);
    expect(job.quietUntil).toBeLessThanOrEqual(Date.now() + 35_000);
    expect(pending.length).toBe(1);
    expect(pending[0]!.jobId).toBe(job.id);
  });

  it('rejects enqueue from viewer', async () => {
    const res = await postJson('/v1/sync/enqueue', 'stub:view', {
      workspaceId: 'ws-1',
      documentId: 'doc-1',
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'editor_required' });
  });

  it('coalesces enqueue and extends quietUntil', async () => {
    const first = await postJson('/v1/sync/enqueue', 'stub:alice', {
      workspaceId: 'ws-1',
      documentId: 'doc-1',
    });
    const job1 = (await first.json()) as { id: string; quietUntil: number };
    await new Promise((r) => setTimeout(r, 20));
    const second = await postJson('/v1/sync/enqueue', 'stub:alice', {
      workspaceId: 'ws-1',
      documentId: 'doc-1',
    });
    const job2 = (await second.json()) as { id: string; quietUntil: number };
    expect(job2.id).toBe(job1.id);
    expect(job2.quietUntil).toBeGreaterThanOrEqual(job1.quietUntil);
  });

  it('commits via GitHub App after quiet period', async () => {
    // Drive enqueue + run with injectable clock (unit path, not HTTP Date.now).
    const result = await enqueueSyncJob(
      { uid: 'ed' },
      { workspaceId: 'ws-1', documentId: 'doc-2' },
      {
        jobStore,
        inviteStore,
        queue: makeQueue(),
        now: () => clock,
        quietMs: 30_000,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(pending[0]!.runAt).toBe(clock + 30_000);

    clock += 30_000;
    await flushDue();
    const stored = await jobStore.getJob(result.job.id);
    expect(stored?.state).toBe('succeeded');
    expect(committer.commits.some((c) => c.jobId === result.job.id)).toBe(true);
  });

  it('retries transient GitHub commit failures via Cloud Tasks', async () => {
    committer = createStubGithubSyncCommitter({ failTransientTimes: 1 });
    setGithubSyncCommitter(committer);

    const result = await enqueueSyncJob(
      { uid: 'ed' },
      { workspaceId: 'ws-1', documentId: 'doc-3' },
      {
        jobStore,
        inviteStore,
        queue: makeQueue(),
        now: () => clock,
        quietMs: 30_000,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    clock += 30_000;
    await flushDue();
    let stored = await jobStore.getJob(result.job.id);
    expect(stored?.state).toBe('queued');
    expect(stored?.attempt).toBe(1);
    expect(committer.commits.length).toBe(0);

    clock += 5_000;
    await flushDue();
    stored = await jobStore.getJob(result.job.id);
    expect(stored?.state).toBe('succeeded');
    expect(committer.commits.length).toBe(1);
  });

  it('runs SyncJob via internal Cloud Tasks callback', async () => {
    process.env.SYNC_TASKS_SECRET = 'task-secret';
    const enq = await enqueueSyncJob(
      { uid: 'ed' },
      { workspaceId: 'ws-1', documentId: 'doc-4' },
      {
        jobStore,
        inviteStore,
        queue: makeQueue(),
        now: () => clock,
        quietMs: 0,
      },
    );
    expect(enq.ok).toBe(true);
    if (!enq.ok) return;

    clock += 1;
    const run = await fetch(`${baseUrl}/v1/internal/sync/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sync-task-secret': 'task-secret',
      },
      body: JSON.stringify({ jobId: enq.job.id }),
    });
    expect(run.status).toBe(200);
    const body = (await run.json()) as { job: { state: string }; sha: string };
    expect(body.job.state).toBe('succeeded');
    expect(body.sha).toMatch(/^stub-/);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
