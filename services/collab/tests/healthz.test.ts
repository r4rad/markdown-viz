import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer, type CollabServer } from '../src/app.js';

describe('GET /healthz', () => {
  let server: CollabServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer();
    await server.collabReady;
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await server.collabClose();
  });

  it('returns ok without auth or secrets', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
