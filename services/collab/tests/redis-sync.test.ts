import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { createServer, type CollabServer } from '../src/app.js';
import { MemoryPubSub, MemoryPubSubBus } from '../src/pubsub.js';
import { RoomRegistry } from '../src/rooms.js';
import { clearSnapshotStubs } from '../src/snapshot.js';

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

function waitMessage(ws: WebSocket, timeoutMs = 4000): Promise<Buffer> {
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

describe('multi-instance sync via pub/sub (Redis adapter contract)', () => {
  let serverA: CollabServer;
  let serverB: CollabServer;
  let portA: number;
  let portB: number;
  const prevMode = process.env.FIREBASE_AUTH_MODE;
  const bus = new MemoryPubSubBus();

  beforeAll(async () => {
    process.env.FIREBASE_AUTH_MODE = 'stub';
    const pubA = new MemoryPubSub(bus, 'instance-a');
    const pubB = new MemoryPubSub(bus, 'instance-b');

    serverA = createServer({
      rooms: new RoomRegistry(),
      pubsub: pubA,
      instanceId: 'instance-a',
    });
    serverB = createServer({
      rooms: new RoomRegistry(),
      pubsub: pubB,
      instanceId: 'instance-b',
    });

    await Promise.all([serverA.collabReady, serverB.collabReady]);

    await new Promise<void>((resolve) => {
      serverA.listen(0, '127.0.0.1', () => resolve());
    });
    await new Promise<void>((resolve) => {
      serverB.listen(0, '127.0.0.1', () => resolve());
    });
    portA = (serverA.address() as AddressInfo).port;
    portB = (serverB.address() as AddressInfo).port;
  });

  afterEach(() => {
    serverA.collabRooms.clear();
    serverB.collabRooms.clear();
    clearSnapshotStubs();
  });

  afterAll(async () => {
    if (prevMode === undefined) {
      delete process.env.FIREBASE_AUTH_MODE;
    } else {
      process.env.FIREBASE_AUTH_MODE = prevMode;
    }
    await serverA.collabClose();
    await serverB.collabClose();
  });

  it('propagates Yjs updates between clients on different gateway instances', async () => {
    const docId = 'doc-multi-1';
    const clientOnA = new WebSocket(`ws://127.0.0.1:${portA}/doc/${docId}?token=stub:alice`);
    const clientOnB = new WebSocket(`ws://127.0.0.1:${portB}/doc/${docId}?token=stub:bob`);

    await Promise.all([waitOpen(clientOnA), waitOpen(clientOnB)]);

    const yA = new Y.Doc();
    const yB = new Y.Doc();
    const textA = yA.getText('content');
    const textB = yB.getText('content');

    const bGotUpdate = waitMessage(clientOnB);

    yA.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return;
      clientOnA.send(update);
    });

    clientOnB.on('message', (data) => {
      const buf = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data as ArrayBuffer);
      Y.applyUpdate(yB, new Uint8Array(buf), 'remote');
    });

    yA.transact(() => {
      textA.insert(0, 'cross-instance hello');
    });

    await bGotUpdate;
    await new Promise((r) => setTimeout(r, 50));

    expect(textB.toString()).toBe('cross-instance hello');

    clientOnA.close();
    clientOnB.close();
    yA.destroy();
    yB.destroy();
  });
});

describe('pubsub helpers', () => {
  it('round-trips channel document ids with special characters', async () => {
    const { channelForDoc, documentIdFromChannel } = await import('../src/pubsub.js');
    const id = 'ws/doc:1';
    expect(documentIdFromChannel(channelForDoc(id))).toBe(id);
  });
});
