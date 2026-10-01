import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { requireAuth } from './middleware/auth.js';
import {
  acceptInvite,
  createInvite,
  listWorkspaceInvites,
} from './invites/handlers.js';
import { getInviteStore, setInviteStore, type InviteStore } from './invites/store.js';
import { handleGithubWebhook, linkInstallation } from './github/handlers.js';
import { getRepoLinkStore, setRepoLinkStore, type RepoLinkStore } from './github/store.js';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const raw = await readRawBody(req);
  const text = raw.toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { __parseError: true };
  }
}

export type CreateServerOptions = {
  inviteStore?: InviteStore;
  repoLinkStore?: RepoLinkStore;
};

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `http://${host}`);
  const { pathname } = url;
  const method = req.method ?? 'GET';

  if (method === 'GET' && pathname === '/healthz') {
    sendJson(res, 200, { ok: true });
    return;
  }

  // GitHub webhooks: signature auth only (no Firebase bearer).
  if (method === 'POST' && pathname === '/v1/github/webhooks') {
    const raw = await readRawBody(req);
    const result = await handleGithubWebhook(req.headers, raw);
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      received: true,
      event: result.event,
      delivery: result.delivery,
    });
    return;
  }

  if (pathname.startsWith('/v1/')) {
    const auth = await requireAuth(req);
    if (!auth.ok) {
      sendJson(res, auth.status, { error: auth.error });
      return;
    }

    const store = getInviteStore();

    if (method === 'POST' && pathname === '/v1/invites') {
      const body = await readJsonBody(req);
      if (body && typeof body === 'object' && '__parseError' in body) {
        sendJson(res, 400, { error: 'invalid_json' });
        return;
      }
      const result = await createInvite(auth.user, body, store);
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error });
        return;
      }
      sendJson(res, 201, {
        id: result.invite.id,
        workspaceId: result.invite.workspaceId,
        email: result.invite.email,
        role: result.invite.role,
        status: result.invite.status,
        acceptPath: result.acceptPath,
      });
      return;
    }

    const acceptMatch = /^\/v1\/invites\/([^/]+)\/accept$/.exec(pathname);
    if (method === 'POST' && acceptMatch) {
      const inviteId = decodeURIComponent(acceptMatch[1]!);
      const result = await acceptInvite(auth.user, inviteId, store);
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error });
        return;
      }
      sendJson(res, 200, {
        workspaceId: result.workspaceId,
        role: result.role,
        uid: result.membershipUid,
      });
      return;
    }

    const listMatch = /^\/v1\/workspaces\/([^/]+)\/invites$/.exec(pathname);
    if (method === 'GET' && listMatch) {
      const workspaceId = decodeURIComponent(listMatch[1]!);
      const result = await listWorkspaceInvites(auth.user, workspaceId, store);
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error });
        return;
      }
      sendJson(res, 200, { invites: result.invites });
      return;
    }

    if (method === 'POST' && pathname === '/v1/github/installations/link') {
      const body = await readJsonBody(req);
      if (body && typeof body === 'object' && '__parseError' in body) {
        sendJson(res, 400, { error: 'invalid_json' });
        return;
      }
      const result = await linkInstallation(
        auth.user,
        body,
        getRepoLinkStore(),
        store,
      );
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error });
        return;
      }
      sendJson(res, 201, result.link);
      return;
    }

    sendJson(res, 404, { error: 'not_found', uid: auth.user.uid });
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}

/** Create the HTTP server (no listen) for Cloud Run / tests. */
export function createServer(options: CreateServerOptions = {}): http.Server {
  if (options.inviteStore) {
    setInviteStore(options.inviteStore);
  }
  if (options.repoLinkStore) {
    setRepoLinkStore(options.repoLinkStore);
  }

  return http.createServer((req, res) => {
    void handleRequest(req, res).catch((err: unknown) => {
      console.error(err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal_error' });
      }
    });
  });
}
