import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { extractToken, verifyFirebaseIdToken, type AuthUser } from './middleware/auth.js';
import { RoomRegistry, type RoomClient } from './rooms.js';
import { persistSnapshotStub } from './snapshot.js';
import type { PubSubAdapter } from './pubsub.js';

const DOC_PATH = /^\/doc\/([^/?#]+)$/;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function parseDocPath(pathname: string): string | null {
  const match = DOC_PATH.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}

async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `http://${host}`);
  const method = req.method ?? 'GET';

  if (method === 'GET' && url.pathname === '/healthz') {
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}

export type CreateServerOptions = {
  /** Isolated room map (required for multi-instance tests in one process). */
  rooms?: RoomRegistry;
  /** Cross-instance pub/sub (Redis or shared MemoryPubSub). */
  pubsub?: PubSubAdapter;
  instanceId?: string;
};

export type CollabServer = http.Server & {
  collabRooms: RoomRegistry;
  collabPubSub: PubSubAdapter | null;
  collabInstanceId: string;
  /** Await after createServer when pubsub.start is async. */
  collabReady: Promise<void>;
  collabClose: () => Promise<void>;
};

function attachSocket(
  ws: WebSocket,
  documentId: string,
  user: AuthUser,
  rooms: RoomRegistry,
  pubsub: PubSubAdapter | null,
): void {
  const client: RoomClient = { ws, uid: user.uid };
  const room = rooms.joinRoom(documentId, client);

  const state = rooms.encodeRoomState(room);
  if (state.byteLength > 0 && ws.readyState === ws.OPEN) {
    ws.send(state);
  }
  persistSnapshotStub(documentId, room.ydoc, room.clients.size);

  ws.on('message', (data, isBinary) => {
    const buf = Buffer.isBuffer(data)
      ? data
      : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(data as ArrayBuffer);
    if (!isBinary && buf.length === 0) return;
    const update = new Uint8Array(buf);
    if (update.byteLength === 0) return;
    rooms.applyAndBroadcast(room, update, client);
    if (pubsub) {
      void pubsub.publish(documentId, update).catch((err: unknown) => {
        console.error('pubsub publish failed', err);
      });
    }
  });

  ws.on('close', () => {
    rooms.leaveRoom(documentId, client);
  });
}

/** Create HTTP + WebSocket server (no listen) for Cloud Run / tests. */
export function createServer(options: CreateServerOptions = {}): CollabServer {
  const rooms = options.rooms ?? new RoomRegistry();
  const pubsub = options.pubsub ?? null;
  const instanceId = options.instanceId ?? pubsub?.instanceId ?? randomUUID();

  const server = http.createServer((req, res) => {
    void handleHttp(req, res).catch((err: unknown) => {
      console.error(err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal_error' });
      }
    });
  }) as CollabServer;

  server.collabRooms = rooms;
  server.collabPubSub = pubsub;
  server.collabInstanceId = instanceId;

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    void (async () => {
      const host = req.headers.host ?? 'localhost';
      const url = new URL(req.url ?? '/', `http://${host}`);
      const documentId = parseDocPath(url.pathname);

      if (!documentId) {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      const token = extractToken(url, req.headers.authorization);
      const auth = await verifyFirebaseIdToken(token);
      if (!auth.ok) {
        const status = auth.status === 501 ? 501 : 401;
        const reason = auth.status === 501 ? 'Not Implemented' : 'Unauthorized';
        socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
        attachSocket(ws, documentId, auth.user, rooms, pubsub);
      });
    })().catch((err: unknown) => {
      console.error(err);
      socket.destroy();
    });
  });

  server.collabReady = pubsub
    ? pubsub.start((documentId, update) => {
        rooms.applyFromRemote(documentId, update);
      })
    : Promise.resolve();

  server.collabClose = async () => {
    await pubsub?.stop();
    rooms.clear();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return server;
}
