import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { createServer } from '../src/app.js';
import { createMemoryInviteStore, setInviteStore, type InviteStore } from '../src/invites/store.js';
import {
  createMemoryRepoLinkStore,
  setRepoLinkStore,
  type RepoLinkStore,
} from '../src/github/store.js';
import { signGithubWebhookBody } from '../src/github/webhook.js';
import {
  FORBIDDEN_VITE_GITHUB_SECRET_KEYS,
  getGithubAppConfig,
  rejectViteGithubAppSecrets,
} from '../src/github/config.js';

describe('GitHub App link + webhook', () => {
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
    process.env.GITHUB_APP_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.GITHUB_APP_ID = '12345';
    // Private key stays server-side only; link route must not expose it.
    process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nstub\n-----END RSA PRIVATE KEY-----';

    inviteStore = createMemoryInviteStore();
    repoStore = createMemoryRepoLinkStore();
    setInviteStore(inviteStore);
    setRepoLinkStore(repoStore);
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
    await inviteStore.setOwner('ws-1', 'alice');
    process.env.GITHUB_APP_WEBHOOK_SECRET = 'test-webhook-secret';
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
    for (const { key, value } of clearedVite) {
      restoreEnv(key, value);
    }
  });

  afterEach(() => {
    for (const key of FORBIDDEN_VITE_GITHUB_SECRET_KEYS) {
      delete process.env[key];
    }
  });

  async function postJson(path: string, token: string | null, body: unknown, extraHeaders?: Record<string, string>) {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(extraHeaders ?? {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  async function postRaw(
    path: string,
    raw: string,
    headers: Record<string, string>,
  ) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: raw,
    });
  }

  it('stores RepositoryLink for owner without exposing App private key', async () => {
    const res = await postJson('/v1/github/installations/link', 'stub:alice', {
      workspaceId: 'ws-1',
      installationId: 42,
      owner: 'acme',
      repo: 'docs',
      syncBranch: 'markdownviz/sync',
      pathPrefix: 'wiki',
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.workspaceId).toBe('ws-1');
    expect(json.installationId).toBe(42);
    expect(json.owner).toBe('acme');
    expect(json.repo).toBe('docs');
    expect(json.syncBranch).toBe('markdownviz/sync');
    expect(json.pathPrefix).toBe('wiki');
    expect(typeof json.id).toBe('string');

    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain('PRIVATE KEY');
    expect(serialized).not.toContain('GITHUB_APP');
    expect(serialized).not.toContain('test-webhook-secret');
    expect(json).not.toHaveProperty('privateKey');
    expect(json).not.toHaveProperty('webhookSecret');

    const stored = await repoStore.getLink(String(json.id));
    expect(stored?.repo).toBe('docs');
  });

  it('rejects link from non-owners', async () => {
    const res = await postJson('/v1/github/installations/link', 'stub:eve', {
      workspaceId: 'ws-1',
      installationId: 1,
      owner: 'o',
      repo: 'r',
      syncBranch: 'main',
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'owner_required' });
  });

  it('verifies webhook signature before processing', async () => {
    const raw = JSON.stringify({ zen: 'design from failure', hook_id: 1 });
    const sig = signGithubWebhookBody(raw, 'test-webhook-secret');

    const ok = await postRaw('/v1/github/webhooks', raw, {
      'x-hub-signature-256': sig,
      'x-github-event': 'ping',
      'x-github-delivery': 'delivery-1',
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      ok: true,
      received: true,
      event: 'ping',
      delivery: 'delivery-1',
    });

    const bad = await postRaw('/v1/github/webhooks', raw, {
      'x-hub-signature-256': 'sha256=deadbeef',
      'x-github-event': 'push',
    });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: 'invalid_signature' });
  });

  it('rejects webhook when secret is missing', async () => {
    delete process.env.GITHUB_APP_WEBHOOK_SECRET;
    const raw = '{}';
    const res = await postRaw('/v1/github/webhooks', raw, {
      'x-hub-signature-256': signGithubWebhookBody(raw, 'anything'),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'webhook_secret_not_configured' });
  });

  it('rejects GitHub App secrets under VITE_* names', () => {
    process.env.VITE_GITHUB_APP_PRIVATE_KEY = 'leaked';
    expect(rejectViteGithubAppSecrets()).toEqual({
      ok: false,
      keys: ['VITE_GITHUB_APP_PRIVATE_KEY'],
    });
    expect(() => getGithubAppConfig()).toThrow(/VITE_\*/);
    delete process.env.VITE_GITHUB_APP_PRIVATE_KEY;
  });

  it('loads App credentials only from non-VITE Cloud Run env', () => {
    const cfg = getGithubAppConfig();
    expect(cfg.appId).toBe('12345');
    expect(cfg.privateKey).toContain('BEGIN RSA PRIVATE KEY');
    expect(cfg.webhookSecret).toBe('test-webhook-secret');
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
