import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { createServer, type CollabServer } from '../src/app.js';
import { clearSnapshotStubs, getSnapshotStub } from '../src/snapshot.js';

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

function waitMessage(ws: WebSocket, timeoutMs = 3000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for message')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      const buf = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data as ArrayBuffer);
      resolve(buf);
    });
  });
}

describe('collab WebSocket gateway', () => {
  let server: CollabServer;
  let port: number;
  const prevMode = process.env.FIREBASE_AUTH_MODE;

  beforeAll(async () => {
    process.env.FIREBASE_AUTH_MODE = 'stub';
    server = createServer();
    await server.collabReady;
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    port = (server.address() as AddressInfo).port;
  });

  afterEach(() => {
    server.collabRooms.clear();
    clearSnapshotStubs();
  });

  afterAll(async () => {
    if (prevMode === undefined) {
      delete process.env.FIREBASE_AUTH_MODE;
    } else {
      process.env.FIREBASE_AUTH_MODE = prevMode;
    }
    await server.collabClose();
  });

  it('rejects upgrade when token is missing', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/doc/doc-reject`);
    const err = await new Promise<Error>((resolve) => {
      ws.once('unexpected-response', (_req, res) => {
        expect(res.statusCode).toBe(401);
        res.resume();
        resolve(new Error('rejected'));
      });
      ws.once('error', (e) => resolve(e));
    });
    expect(err).toBeTruthy();
    ws.close();
  });

  it('syncs Yjs updates between two authenticated clients', async () => {
    const docId = 'doc-sync-1';
    const a = new WebSocket(`ws://127.0.0.1:${port}/doc/${docId}?token=stub:alice`);
    const b = new WebSocket(`ws://127.0.0.1:${port}/doc/${docId}?token=stub:bob`);

    await Promise.all([waitOpen(a), waitOpen(b)]);

    const yA = new Y.Doc();
    const yB = new Y.Doc();
    const textA = yA.getText('content');
    const textB = yB.getText('content');

    const bGotUpdate = waitMessage(b);

    yA.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      a.send(update);
    });

    b.on('message', (data) => {
      const buf = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data as ArrayBuffer);
      Y.applyUpdate(yB, new Uint8Array(buf), 'remote');
    });

    yA.transact(() => {
      textA.insert(0, 'hello from alice');
    });

    await bGotUpdate;
    await new Promise((r) => setTimeout(r, 50));

    expect(textB.toString()).toBe('hello from alice');
    expect(getSnapshotStub(docId)?.snapshot.byteLength).toBeGreaterThan(0);

    a.close();
    b.close();
    yA.destroy();
    yB.destroy();
  });
});
