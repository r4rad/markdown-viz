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
  createMemoryConflictStore,
  createMemoryDocumentSyncStore,
  setConflictStore,
  setDocumentSyncStore,
} from '../src/conflicts/store.js';
import { createMemorySyncJobStore, setSyncJobStore } from '../src/sync/store.js';
import {
  ingestRemoteChange,
  upsertDocumentSync,
} from '../src/conflicts/handlers.js';
import { threeWayMerge } from '../src/sync/merge.js';
import { signGithubWebhookBody } from '../src/github/webhook.js';
import {
  FORBIDDEN_VITE_GITHUB_SECRET_KEYS,
  rejectViteGithubAppSecrets,
} from '../src/github/config.js';

/**
 * Wave 6 exit-criteria suite (task 6.3) for the trusted API:
 * ACL denials, GitHub App mocks, and sync conflict fixtures.
 */

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe('product surface verification (API exit criteria)', () => {
  let server: http.Server;
  let baseUrl: string;
  let inviteStore: InviteStore;
  let repoStore: RepoLinkStore;

  const prevWebhook = process.env.GITHUB_APP_WEBHOOK_SECRET;
  const prevAppId = process.env.GITHUB_APP_ID;
  const prevPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const clearedVite: Array<{ key: string; value: string | undefined }> = [];

  beforeAll(async () => {
    for (const key of FORBIDDEN_VITE_GITHUB_SECRET_KEYS) {
      clearedVite.push({ key, value: process.env[key] });
      delete process.env[key];
    }
    process.env.GITHUB_APP_WEBHOOK_SECRET = 'verify-webhook-secret';
    process.env.GITHUB_APP_ID = '12345';
    process.env.GITHUB_APP_PRIVATE_KEY =
      '-----BEGIN RSA PRIVATE KEY-----\nstub\n-----END RSA PRIVATE KEY-----';

    inviteStore = createMemoryInviteStore();
    repoStore = createMemoryRepoLinkStore();
    setInviteStore(inviteStore);
    setRepoLinkStore(repoStore);
    setConflictStore(createMemoryConflictStore());
    setDocumentSyncStore(createMemoryDocumentSyncStore());
    setSyncJobStore(createMemorySyncJobStore());

    server = createServer({ inviteStore, repoLinkStore: repoStore });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  beforeEach(async () => {
    inviteStore = createMemoryInviteStore();
    repoStore = createMemoryRepoLinkStore();
    setInviteStore(inviteStore);
    setRepoLinkStore(repoStore);
    setConflictStore(createMemoryConflictStore());
    setDocumentSyncStore(createMemoryDocumentSyncStore());
    setSyncJobStore(createMemorySyncJobStore());
    await inviteStore.setOwner('ws-1', 'alice');
    await inviteStore.putMembership({
      workspaceId: 'ws-1',
      uid: 'view',
      email: 'view@example.com',
      role: 'viewer',
      addedAt: 1,
    });
    process.env.GITHUB_APP_WEBHOOK_SECRET = 'verify-webhook-secret';
    for (const key of FORBIDDEN_VITE_GITHUB_SECRET_KEYS) {
      delete process.env[key];
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    restoreEnv('GITHUB_APP_WEBHOOK_SECRET', prevWebhook);
    restoreEnv('GITHUB_APP_ID', prevAppId);
    restoreEnv('GITHUB_APP_PRIVATE_KEY', prevPrivateKey);
    for (const { key, value } of clearedVite) restoreEnv(key, value);
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

  describe('ACL denials', () => {
    it('rejects sync enqueue from viewer', async () => {
      const res = await postJson('/v1/sync/enqueue', 'stub:view', {
        workspaceId: 'ws-1',
        documentId: 'doc-1',
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'editor_required' });
    });

    it('rejects GitHub App link from non-owners', async () => {
      const res = await postJson('/v1/github/installations/link', 'stub:view', {
        workspaceId: 'ws-1',
        installationId: 1,
        owner: 'o',
        repo: 'r',
        syncBranch: 'main',
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'owner_required' });
    });
  });

  describe('GitHub App mocks', () => {
    it('accepts signed webhook with server-side secret mock', async () => {
      const raw = JSON.stringify({ zen: 'verify', hook_id: 9 });
      const sig = signGithubWebhookBody(raw, 'verify-webhook-secret');
      const res = await fetch(`${baseUrl}/v1/github/webhooks`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sig,
          'x-github-event': 'ping',
          'x-github-delivery': 'verify-1',
        },
        body: raw,
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; event: string };
      expect(json.ok).toBe(true);
      expect(json.event).toBe('ping');
    });

    it('rejects VITE_* GitHub App secret names', () => {
      process.env.VITE_GITHUB_APP_PRIVATE_KEY = 'leaked';
      expect(rejectViteGithubAppSecrets()).toEqual({
        ok: false,
        keys: ['VITE_GITHUB_APP_PRIVATE_KEY'],
      });
      delete process.env.VITE_GITHUB_APP_PRIVATE_KEY;
    });
  });

  describe('sync conflict fixtures', () => {
    it('three-way merge fixture flags overlapping lines', () => {
      const result = threeWayMerge('base\n', 'local\n', 'remote\n');
      expect(result.conflict).toBe(true);
    });

    it('ingest creates Conflict sync status for overlapping remote', async () => {
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
    });
  });
});
