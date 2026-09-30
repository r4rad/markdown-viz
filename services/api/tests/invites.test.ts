import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { createServer } from '../src/app.js';
import { createMemoryInviteStore, setInviteStore, type InviteStore } from '../src/invites/store.js';

describe('invites API', () => {
  let server: http.Server;
  let baseUrl: string;
  let store: InviteStore;

  beforeAll(async () => {
    store = createMemoryInviteStore();
    setInviteStore(store);
    server = createServer({ inviteStore: store });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  beforeEach(async () => {
    store = createMemoryInviteStore();
    setInviteStore(store);
    await store.setOwner('ws-1', 'alice');
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  async function post(path: string, token: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function get(path: string, token: string) {
    return fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  it('creates an invite via Cloud Run for the workspace owner', async () => {
    const res = await post('/v1/invites', 'stub:alice:alice@example.com', {
      workspaceId: 'ws-1',
      email: 'bob@example.com',
      role: 'commentator',
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      id: string;
      email: string;
      role: string;
      acceptPath: string;
      status: string;
    };
    expect(json.email).toBe('bob@example.com');
    expect(json.role).toBe('commentator');
    expect(json.status).toBe('pending');
    expect(json.acceptPath).toBe(`/invite/${json.id}`);
  });

  it('rejects invite create from non-owners', async () => {
    const res = await post('/v1/invites', 'stub:eve:eve@example.com', {
      workspaceId: 'ws-1',
      email: 'bob@example.com',
      role: 'editor',
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'owner_required' });
  });

  it('accepts invite when token email matches', async () => {
    const created = await post('/v1/invites', 'stub:alice', {
      workspaceId: 'ws-1',
      email: 'Bob@Example.com',
      role: 'viewer',
    });
    const { id } = (await created.json()) as { id: string };

    const res = await post(`/v1/invites/${id}/accept`, 'stub:bob:bob@example.com');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      workspaceId: 'ws-1',
      role: 'viewer',
      uid: 'bob',
    });

    const member = await store.getMembership('ws-1', 'bob');
    expect(member?.role).toBe('viewer');
  });

  it('returns 403 on email mismatch and leaves invite pending', async () => {
    const created = await post('/v1/invites', 'stub:alice', {
      workspaceId: 'ws-1',
      email: 'bob@example.com',
      role: 'editor',
    });
    const { id } = (await created.json()) as { id: string };

    const res = await post(`/v1/invites/${id}/accept`, 'stub:mallory:mallory@example.com');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'invite_email_mismatch' });

    const invite = await store.getInvite(id);
    expect(invite?.status).toBe('pending');
  });

  it('lists pending invites for the owner', async () => {
    await post('/v1/invites', 'stub:alice', {
      workspaceId: 'ws-1',
      email: 'a@ex.com',
      role: 'editor',
    });
    const res = await get('/v1/workspaces/ws-1/invites', 'stub:alice');
    expect(res.status).toBe(200);
    const json = (await res.json()) as { invites: Array<{ email: string }> };
    expect(json.invites).toHaveLength(1);
    expect(json.invites[0]?.email).toBe('a@ex.com');
  });
});
