import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { createServer } from '../src/app.js';
import { createMemoryInviteStore, setInviteStore } from '../src/invites/store.js';
import {
  createMemoryHistoryStore,
  setHistoryStore,
} from '../src/history/store.js';
import {
  HISTORY_COMPACTION_EVENTS,
  planHistoryBlobs,
  shouldCompactSnapshot,
  type HistoryRecord,
} from '../src/history/types.js';
import { appendHistory, listHistory, restoreHistory } from '../src/history/handlers.js';

describe('history compaction helpers', () => {
  it('does not compact below interval', () => {
    expect(
      shouldCompactSnapshot({
        eventsSinceLastSnapshot: 10,
        deltaBytesSinceLastSnapshot: 100,
      }),
    ).toBe(false);
  });

  it('compacts at event interval', () => {
    expect(
      shouldCompactSnapshot({
        eventsSinceLastSnapshot: HISTORY_COMPACTION_EVENTS,
        deltaBytesSinceLastSnapshot: 0,
      }),
    ).toBe(true);
  });

  it('first event is a snapshot; next is a delta', () => {
    const first = planHistoryBlobs({
      workspaceId: 'ws',
      documentId: 'doc',
      eventId: 'e0',
      existing: [],
      nextContentBytes: 20,
    });
    expect(first.kind).toBe('snap');
    const existing: HistoryRecord[] = [
      {
        id: 'e0',
        documentId: 'doc',
        workspaceId: 'ws',
        authorId: 'u',
        createdAt: 1,
        source: 'save',
        checksum: 'a',
        snapshotPath: first.snapshotPath,
        content: 'hello',
        contentBytes: 5,
      },
    ];
    const next = planHistoryBlobs({
      workspaceId: 'ws',
      documentId: 'doc',
      eventId: 'e1',
      existing,
      nextContentBytes: 5,
    });
    expect(next.kind).toBe('delta');
  });
});

describe('history append + restore (unlimited)', () => {
  beforeEach(() => {
    setHistoryStore(createMemoryHistoryStore());
    const invites = createMemoryInviteStore();
    setInviteStore(invites);
  });

  it('retains more than 50 events without deletion', async () => {
    const invites = createMemoryInviteStore();
    setInviteStore(invites);
    await invites.setOwner('ws-1', 'alice');

    for (let i = 0; i < 55; i++) {
      const result = await appendHistory(
        { uid: 'alice' },
        'doc-1',
        { workspaceId: 'ws-1', content: `body-${i}`, source: 'save' },
        { now: () => i + 1 },
      );
      expect(result.ok).toBe(true);
    }

    const listed = await listHistory({ uid: 'alice' }, 'doc-1', 'ws-1');
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.events).toHaveLength(55);
    expect(listed.events[listed.events.length - 1]!.id).toBeTruthy();
    const snaps = listed.events.filter((e) => e.snapshotPath);
    expect(snaps.length).toBeGreaterThanOrEqual(2);
  });

  it('restore appends a new restore event and keeps the prior one', async () => {
    const invites = createMemoryInviteStore();
    setInviteStore(invites);
    await invites.setOwner('ws-1', 'alice');

    const first = await appendHistory(
      { uid: 'alice' },
      'doc-1',
      { workspaceId: 'ws-1', content: 'original', source: 'save' },
      { now: () => 1 },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await appendHistory(
      { uid: 'alice' },
      'doc-1',
      { workspaceId: 'ws-1', content: 'changed', source: 'save' },
      { now: () => 2 },
    );

    const restored = await restoreHistory(
      { uid: 'alice' },
      'doc-1',
      { workspaceId: 'ws-1', eventId: first.event.id },
      { now: () => 3 },
    );
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.content).toBe('original');
    expect(restored.event.source).toBe('restore');
    expect(restored.event.snapshotPath).toContain('.snap.zst');
    expect(restored.event.id).not.toBe(first.event.id);

    const listed = await listHistory({ uid: 'alice' }, 'doc-1', 'ws-1');
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.events).toHaveLength(3);
    expect(listed.events.some((e) => e.id === first.event.id)).toBe(true);
    expect(listed.events.some((e) => e.source === 'restore')).toBe(true);
  });

  it('viewer cannot restore; can list', async () => {
    const invites = createMemoryInviteStore();
    setInviteStore(invites);
    await invites.setOwner('ws-1', 'alice');
    await invites.putMembership({
      workspaceId: 'ws-1',
      uid: 'viewer1',
      email: 'v@example.com',
      role: 'viewer',
      addedAt: 1,
    });

    const first = await appendHistory(
      { uid: 'alice' },
      'doc-1',
      { workspaceId: 'ws-1', content: 'x', source: 'save' },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const list = await listHistory({ uid: 'viewer1' }, 'doc-1', 'ws-1');
    expect(list.ok).toBe(true);

    const denied = await restoreHistory(
      { uid: 'viewer1' },
      'doc-1',
      { workspaceId: 'ws-1', eventId: first.event.id },
    );
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.status).toBe(403);
  });
});

describe('history HTTP routes', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const invites = createMemoryInviteStore();
    await invites.setOwner('ws-1', 'alice');
    const historyStore = createMemoryHistoryStore();
    setInviteStore(invites);
    setHistoryStore(historyStore);
    server = createServer({
      inviteStore: invites,
      historyStore,
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
  });

  async function json(
    path: string,
    init: RequestInit & { token?: string } = {},
  ): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    };
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    if (init.body && !headers['content-type']) {
      headers['content-type'] = 'application/json';
    }
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
    const body = await res.json();
    return { status: res.status, body };
  }

  it('POST append + GET list + POST restore', async () => {
    const created = await json('/v1/history/doc-http', {
      method: 'POST',
      token: 'stub:alice',
      body: JSON.stringify({
        workspaceId: 'ws-1',
        content: 'v1',
        source: 'save',
      }),
    });
    expect(created.status).toBe(201);
    expect(created.body.event.snapshotPath).toContain('.snap.zst');

    await json('/v1/history/doc-http', {
      method: 'POST',
      token: 'stub:alice',
      body: JSON.stringify({
        workspaceId: 'ws-1',
        content: 'v2',
        source: 'save',
      }),
    });

    const listed = await json('/v1/history/doc-http?workspaceId=ws-1', {
      method: 'GET',
      token: 'stub:alice',
    });
    expect(listed.status).toBe(200);
    expect(listed.body.events.length).toBe(2);

    const eventId = listed.body.events[1].id; // older (newest-first)
    const restored = await json('/v1/history/doc-http/restore', {
      method: 'POST',
      token: 'stub:alice',
      body: JSON.stringify({ workspaceId: 'ws-1', eventId }),
    });
    expect(restored.status).toBe(201);
    expect(restored.body.event.source).toBe('restore');
    expect(restored.body.content).toBe('v1');

    const after = await json('/v1/history/doc-http?workspaceId=ws-1', {
      method: 'GET',
      token: 'stub:alice',
    });
    expect(after.body.events.length).toBe(3);
  });
});
