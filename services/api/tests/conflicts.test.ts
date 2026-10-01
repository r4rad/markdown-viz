import { describe, expect, it, beforeEach } from 'vitest';
import { threeWayMerge, diffHunks } from '../src/sync/merge.js';
import {
  ingestRemoteChange,
  resolveConflict,
  upsertDocumentSync,
  checksumOf,
} from '../src/conflicts/handlers.js';
import {
  createMemoryConflictStore,
  createMemoryDocumentSyncStore,
  setConflictStore,
  setDocumentSyncStore,
} from '../src/conflicts/store.js';
import { createMemoryInviteStore, setInviteStore } from '../src/invites/store.js';
import { createMemorySyncJobStore, setSyncJobStore } from '../src/sync/store.js';
import { enqueueSyncJob } from '../src/sync/handlers.js';
import { createServer } from '../src/app.js';
import { signGithubWebhookBody } from '../src/github/webhook.js';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { afterAll, beforeAll } from 'vitest';
import { FORBIDDEN_VITE_GITHUB_SECRET_KEYS } from '../src/github/config.js';

describe('three-way merge', () => {
  it('auto-merges non-overlapping line edits', () => {
    const base = 'alpha\nbeta\ngamma\n';
    const local = 'alpha-local\nbeta\ngamma\n';
    const remote = 'alpha\nbeta\ngamma-remote\n';
    const result = threeWayMerge(base, local, remote);
    expect(result.conflict).toBe(false);
    if (result.conflict) return;
    expect(result.merged).toContain('alpha-local');
    expect(result.merged).toContain('gamma-remote');
  });

  it('creates conflict on overlapping edits', () => {
    const base = 'same line\n';
    const local = 'local change\n';
    const remote = 'remote change\n';
    const result = threeWayMerge(base, local, remote);
    expect(result.conflict).toBe(true);
    if (!result.conflict) return;
    expect(result.conflicted).toContain('<<<<<<< local');
    expect(result.conflicted).toContain('>>>>>>> remote');
  });

  it('takes remote when local equals base', () => {
    const result = threeWayMerge('base', 'base', 'remote');
    expect(result).toEqual({ ok: true, merged: 'remote', conflict: false });
  });

  it('diffHunks detects a single replacement', () => {
    const hunks = diffHunks(['a', 'b', 'c'], ['a', 'B', 'c']);
    expect(hunks).toEqual([{ baseStart: 1, baseEnd: 2, replacement: ['B'] }]);
  });
});

describe('Conflict ingest + resolve + blocked autosync', () => {
  beforeEach(() => {
    setConflictStore(createMemoryConflictStore());
    setDocumentSyncStore(createMemoryDocumentSyncStore());
    setSyncJobStore(createMemorySyncJobStore());
    const invites = createMemoryInviteStore();
    setInviteStore(invites);
    for (const key of FORBIDDEN_VITE_GITHUB_SECRET_KEYS) {
      delete process.env[key];
    }
  });

  it('creates Conflict and syncStatus=Conflict when local and remote overlap', async () => {
    const invites = createMemoryInviteStore();
    setInviteStore(invites);
    await invites.setOwner('ws-1', 'alice');

    await upsertDocumentSync({
      documentId: 'doc-1',
      workspaceId: 'ws-1',
      path: 'wiki/readme.md',
      localContent: 'local overlap\n',
      baseContent: 'base line\n',
      baseSha: 'sha-base',
      remoteContent: 'base line\n',
      remoteSha: 'sha-base',
      syncStatus: 'Ahead',
    });

    const result = await ingestRemoteChange({
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      path: 'wiki/readme.md',
      remoteContent: 'remote overlap\n',
      remoteSha: 'sha-remote',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.syncStatus).toBe('Conflict');
    expect(result.conflict?.status).toBe('open');
    expect(result.document.syncStatus).toBe('Conflict');
    expect(result.document.openConflictId).toBe(result.conflict!.id);
    expect(checksumOf('local overlap\n')).toBe(result.conflict!.localChecksum);
  });

  it('blocks enqueue while Conflict is open and resumes after resolve', async () => {
    const invites = createMemoryInviteStore();
    setInviteStore(invites);
    await invites.setOwner('ws-1', 'alice');
    await invites.putMembership({
      workspaceId: 'ws-1',
      uid: 'ed',
      email: 'ed@example.com',
      role: 'editor',
      addedAt: 1,
    });

    await upsertDocumentSync({
      documentId: 'doc-1',
      workspaceId: 'ws-1',
      path: 'wiki/readme.md',
      localContent: 'local\n',
      baseContent: 'base\n',
      baseSha: 'b1',
      syncStatus: 'Ahead',
    });

    const ingest = await ingestRemoteChange({
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      path: 'wiki/readme.md',
      remoteContent: 'remote\n',
      remoteSha: 'r1',
    });
    expect(ingest.ok && ingest.conflict).toBeTruthy();
    if (!ingest.ok || !ingest.conflict) return;

    const blocked = await enqueueSyncJob(
      { uid: 'ed', email: 'ed@example.com' },
      { workspaceId: 'ws-1', documentId: 'doc-1' },
    );
    expect(blocked).toEqual({ ok: false, status: 409, error: 'blocked_conflict' });

    const resolved = await resolveConflict(
      { uid: 'ed', email: 'ed@example.com' },
      ingest.conflict.id,
      { resolution: 'local' },
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.conflict.status).toBe('resolved');
    expect(resolved.conflict.resolution).toBe('local');
    expect(resolved.document.syncStatus).toBe('Ahead');
    expect(resolved.document.openConflictId).toBeUndefined();
    expect(resolved.document.localContent).toBe('local\n');

    // Autosync may resume (enqueue no longer blocked by conflict).
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY =
      '-----BEGIN RSA PRIVATE KEY-----\nstub\n-----END RSA PRIVATE KEY-----';
    const enqueued = await enqueueSyncJob(
      { uid: 'ed', email: 'ed@example.com' },
      { workspaceId: 'ws-1', documentId: 'doc-1' },
      {
        quietMs: 0,
        now: () => 1_000,
        queue: {
          async scheduleRun() {},
          async cancel() {},
        },
      },
    );
    expect(enqueued.ok).toBe(true);
  });

  it('resolve take-remote clears conflict to InSync', async () => {
    const invites = createMemoryInviteStore();
    setInviteStore(invites);
    await invites.setOwner('ws-1', 'alice');

    await upsertDocumentSync({
      documentId: 'doc-1',
      workspaceId: 'ws-1',
      path: 'wiki/a.md',
      localContent: 'L',
      baseContent: 'B',
      baseSha: 'b',
    });
    const ingest = await ingestRemoteChange({
      workspaceId: 'ws-1',
      documentId: 'doc-1',
      path: 'wiki/a.md',
      remoteContent: 'R',
      remoteSha: 'r',
    });
    if (!ingest.ok || !ingest.conflict) throw new Error('expected conflict');

    const resolved = await resolveConflict(
      { uid: 'alice', email: null },
      ingest.conflict.id,
      { resolution: 'remote' },
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.document.syncStatus).toBe('InSync');
    expect(resolved.document.localContent).toBe('R');
  });
});

describe('webhook push → Conflict HTTP', () => {
  let server: http.Server;
  let baseUrl: string;
  const prevWebhook = process.env.GITHUB_APP_WEBHOOK_SECRET;
  const clearedVite: Array<{ key: string; value: string | undefined }> = [];

  beforeAll(async () => {
    for (const key of FORBIDDEN_VITE_GITHUB_SECRET_KEYS) {
      clearedVite.push({ key, value: process.env[key] });
      delete process.env[key];
    }
    process.env.GITHUB_APP_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY =
      '-----BEGIN RSA PRIVATE KEY-----\nstub\n-----END RSA PRIVATE KEY-----';

    setConflictStore(createMemoryConflictStore());
    setDocumentSyncStore(createMemoryDocumentSyncStore());
    const invites = createMemoryInviteStore();
    await invites.setOwner('ws-1', 'alice');
    setInviteStore(invites);

    server = createServer({
      inviteStore: invites,
      conflictStore: getFreshConflictStore(),
      documentSyncStore: getFreshDocStore(),
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    restoreEnv('GITHUB_APP_WEBHOOK_SECRET', prevWebhook);
    for (const { key, value } of clearedVite) restoreEnv(key, value);
  });

  function getFreshConflictStore() {
    return createMemoryConflictStore();
  }
  function getFreshDocStore() {
    return createMemoryDocumentSyncStore();
  }

  it('push webhook with overlapping docs returns conflicts', async () => {
    setConflictStore(createMemoryConflictStore());
    setDocumentSyncStore(createMemoryDocumentSyncStore());
    await upsertDocumentSync({
      documentId: 'doc-1',
      workspaceId: 'ws-1',
      path: 'wiki/readme.md',
      localContent: 'local-v\n',
      baseContent: 'base-v\n',
      baseSha: 'base',
    });

    const raw = JSON.stringify({
      ref: 'refs/heads/markdownviz/sync',
      repository: { name: 'docs', owner: { login: 'acme' } },
      markdownviz: {
        documents: [
          {
            workspaceId: 'ws-1',
            documentId: 'doc-1',
            path: 'wiki/readme.md',
            remoteContent: 'remote-v\n',
            remoteSha: 'remote',
          },
        ],
      },
    });
    const sig = signGithubWebhookBody(raw, 'test-webhook-secret');
    const res = await fetch(`${baseUrl}/v1/github/webhooks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': sig,
        'x-github-event': 'push',
        'x-github-delivery': 'd-conflict',
      },
      body: raw,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      conflicts: Array<{ documentId: string }>;
      merged: unknown[];
    };
    expect(json.conflicts).toHaveLength(1);
    expect(json.conflicts[0]!.documentId).toBe('doc-1');
    expect(json.merged).toEqual([]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
