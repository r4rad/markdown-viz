import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { requireAuth } from './middleware/auth.js';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `http://${host}`);
  const { pathname } = url;
  const method = req.method ?? 'GET';

  if (method === 'GET' && pathname === '/healthz') {
    sendJson(res, 200, { ok: true });
    return;
  }

  // Authenticated surface placeholder — real /v1/* routes land in later tasks.
  if (pathname.startsWith('/v1/')) {
    const auth = await requireAuth(req);
    if (!auth.ok) {
      sendJson(res, auth.status, { error: auth.error });
      return;
    }
    sendJson(res, 404, { error: 'not_found', uid: auth.user.uid });
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}

/** Create the HTTP server (no listen) for Cloud Run / tests. */
export function createServer(): http.Server {
  return http.createServer((req, res) => {
    void handleRequest(req, res).catch((err: unknown) => {
      console.error(err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal_error' });
      }
    });
  });
}
