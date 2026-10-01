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
import {
  authorizeSyncTaskRequest,
  enqueueSyncJob,
  runSyncJob,
} from './sync/handlers.js';
import { getSyncJobStore, setSyncJobStore, type SyncJobStore } from './sync/store.js';
import {
  createMemorySyncTaskQueue,
  getSyncTaskQueue,
  setSyncTaskQueue,
  type SyncTaskQueue,
} from './sync/queue.js';
import {
  getGithubSyncCommitter,
  setGithubSyncCommitter,
  type GithubSyncCommitter,
} from './sync/commit.js';
import { resolveConflict } from './conflicts/handlers.js';
import {
  getConflictStore,
  setConflictStore,
  type ConflictStore,
  getDocumentSyncStore,
  setDocumentSyncStore,
  type DocumentSyncStore,
} from './conflicts/store.js';

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
  syncJobStore?: SyncJobStore;
  syncTaskQueue?: SyncTaskQueue;
  githubSyncCommitter?: GithubSyncCommitter;
  conflictStore?: ConflictStore;
  documentSyncStore?: DocumentSyncStore;
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
    const result = await handleGithubWebhook(req.headers, raw, {
      repoStore: getRepoLinkStore(),
    });
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      received: true,
      event: result.event,
      delivery: result.delivery,
      conflicts: result.conflicts ?? [],
      merged: result.merged ?? [],
    });
    return;
  }

  // Cloud Tasks → API: run SyncJob after quiet period (task secret, not Firebase).
  if (method === 'POST' && pathname === '/v1/internal/sync/run') {
    const gate = authorizeSyncTaskRequest(req.headers);
    if (!gate.ok) {
      sendJson(res, gate.status, { error: gate.error });
      return;
    }
    const body = await readJsonBody(req);
    if (body && typeof body === 'object' && '__parseError' in body) {
      sendJson(res, 400, { error: 'invalid_json' });
      return;
    }
    const jobId =
      body && typeof body === 'object' && 'jobId' in body
        ? String((body as { jobId: unknown }).jobId ?? '')
        : '';
    const result = await runSyncJob(jobId, {
      jobStore: getSyncJobStore(),
      repoStore: getRepoLinkStore(),
      queue: getSyncTaskQueue(),
      committer: getGithubSyncCommitter(),
    });
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error });
      return;
    }
    sendJson(res, 200, { job: result.job, sha: result.sha ?? null });
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

    if (method === 'POST' && pathname === '/v1/sync/enqueue') {
      const body = await readJsonBody(req);
      if (body && typeof body === 'object' && '__parseError' in body) {
        sendJson(res, 400, { error: 'invalid_json' });
        return;
      }
      const result = await enqueueSyncJob(auth.user, body, {
        jobStore: getSyncJobStore(),
        inviteStore: store,
        conflictStore: getConflictStore(),
        queue: getSyncTaskQueue(),
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error });
        return;
      }
      sendJson(res, 202, result.job);
      return;
    }

    const resolveMatch = /^\/v1\/conflicts\/([^/]+)\/resolve$/.exec(pathname);
    if (method === 'POST' && resolveMatch) {
      const conflictId = decodeURIComponent(resolveMatch[1]!);
      const body = await readJsonBody(req);
      if (body && typeof body === 'object' && '__parseError' in body) {
        sendJson(res, 400, { error: 'invalid_json' });
        return;
      }
      const result = await resolveConflict(auth.user, conflictId, body, {
        conflictStore: getConflictStore(),
        docStore: getDocumentSyncStore(),
        inviteStore: store,
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error });
        return;
      }
      sendJson(res, 200, {
        conflict: {
          id: result.conflict.id,
          documentId: result.conflict.documentId,
          workspaceId: result.conflict.workspaceId,
          baseSha: result.conflict.baseSha,
          localChecksum: result.conflict.localChecksum,
          remoteSha: result.conflict.remoteSha,
          status: result.conflict.status,
          resolution: result.conflict.resolution,
        },
        document: {
          documentId: result.document.documentId,
          workspaceId: result.document.workspaceId,
          syncStatus: result.document.syncStatus,
          localContent: result.document.localContent,
          openConflictId: result.document.openConflictId ?? null,
        },
      });
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
  if (options.syncJobStore) {
    setSyncJobStore(options.syncJobStore);
  }
  if (options.githubSyncCommitter) {
    setGithubSyncCommitter(options.githubSyncCommitter);
  }
  if (options.conflictStore) {
    setConflictStore(options.conflictStore);
  }
  if (options.documentSyncStore) {
    setDocumentSyncStore(options.documentSyncStore);
  }

  // Default memory Cloud Tasks queue: call runSyncJob in-process after quietUntil.
  if (options.syncTaskQueue) {
    setSyncTaskQueue(options.syncTaskQueue);
  } else {
    setSyncTaskQueue(
      createMemorySyncTaskQueue(async (jobId) => {
        await runSyncJob(jobId, {
          jobStore: getSyncJobStore(),
          repoStore: getRepoLinkStore(),
          queue: getSyncTaskQueue(),
          committer: getGithubSyncCommitter(),
        });
      }),
    );
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
