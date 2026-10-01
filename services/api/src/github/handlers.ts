import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../middleware/auth.js';
import { getInviteStore, type InviteStore } from '../invites/store.js';
import { ingestRemoteChange } from '../conflicts/handlers.js';
import { getGithubAppConfig, rejectViteGithubAppSecrets } from './config.js';
import { getRepoLinkStore, type RepoLinkStore } from './store.js';
import type { RepositoryLink } from './types.js';
import { verifyGithubWebhookSignature } from './webhook.js';

export type HandlerFail = { ok: false; status: number; error: string };
export type LinkOk = { ok: true; link: RepositoryLink };
export type WebhookOk = {
  ok: true;
  received: true;
  event: string | null;
  delivery: string | null;
  /** Documents that entered Conflict during this push (empty when none). */
  conflicts?: Array<{ id: string; documentId: string; workspaceId: string }>;
  /** Documents auto-merged cleanly. */
  merged?: Array<{ documentId: string; workspaceId: string }>;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/**
 * Owner links a GitHub App installation + repo to a workspace.
 * Stores RepositoryLink only — never returns App private key or webhook secret.
 */
export async function linkInstallation(
  user: AuthUser,
  body: unknown,
  repoStore: RepoLinkStore = getRepoLinkStore(),
  inviteStore: InviteStore = getInviteStore(),
): Promise<LinkOk | HandlerFail> {
  const viteCheck = rejectViteGithubAppSecrets();
  if (!viteCheck.ok) {
    return { ok: false, status: 500, error: 'vite_github_secrets_forbidden' };
  }

  // Touch config so misconfigured VITE_* secrets fail closed even if unused here.
  getGithubAppConfig();

  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'invalid_body' };
  }
  const {
    workspaceId,
    installationId,
    owner,
    repo,
    syncBranch,
    pathPrefix,
  } = body as Record<string, unknown>;

  if (!isNonEmptyString(workspaceId)) {
    return { ok: false, status: 400, error: 'workspace_id_required' };
  }
  if (!isPositiveInt(installationId)) {
    return { ok: false, status: 400, error: 'installation_id_required' };
  }
  if (!isNonEmptyString(owner)) {
    return { ok: false, status: 400, error: 'owner_required' };
  }
  if (!isNonEmptyString(repo)) {
    return { ok: false, status: 400, error: 'repo_required' };
  }
  if (!isNonEmptyString(syncBranch)) {
    return { ok: false, status: 400, error: 'sync_branch_required' };
  }
  if (pathPrefix !== undefined && typeof pathPrefix !== 'string') {
    return { ok: false, status: 400, error: 'invalid_path_prefix' };
  }

  const wsId = workspaceId.trim();
  if (!(await inviteStore.isOwner(wsId, user.uid))) {
    return { ok: false, status: 403, error: 'owner_required' };
  }

  const link: RepositoryLink = {
    id: randomUUID(),
    workspaceId: wsId,
    installationId,
    owner: owner.trim(),
    repo: repo.trim(),
    syncBranch: syncBranch.trim(),
    pathPrefix: typeof pathPrefix === 'string' ? pathPrefix.trim() : '',
  };

  await repoStore.createLink(link);
  // Explicitly return metadata only (no privateKey / webhookSecret fields exist).
  return { ok: true, link: { ...link } };
}

/**
 * Ingest GitHub webhook after HMAC verification.
 * Push events run three-way merge (or create durable Conflict) for linked docs.
 *
 * Local/CI may include `markdownviz.documents[]` with remote content so tests
 * do not need a live GitHub Contents API.
 */
export async function handleGithubWebhook(
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer,
  deps: {
    repoStore?: RepoLinkStore;
    ingest?: typeof ingestRemoteChange;
  } = {},
): Promise<WebhookOk | HandlerFail> {
  const viteCheck = rejectViteGithubAppSecrets();
  if (!viteCheck.ok) {
    return { ok: false, status: 500, error: 'vite_github_secrets_forbidden' };
  }

  const config = getGithubAppConfig();
  if (!config.webhookSecret) {
    return { ok: false, status: 503, error: 'webhook_secret_not_configured' };
  }

  const signature = headerValue(headers['x-hub-signature-256']) ?? undefined;
  if (!verifyGithubWebhookSignature(rawBody, signature, config.webhookSecret)) {
    return { ok: false, status: 401, error: 'invalid_signature' };
  }

  const event = headerValue(headers['x-github-event']);
  const delivery = headerValue(headers['x-github-delivery']);

  const conflicts: Array<{ id: string; documentId: string; workspaceId: string }> =
    [];
  const merged: Array<{ documentId: string; workspaceId: string }> = [];

  if (event === 'push') {
    await processPushWebhook(rawBody, conflicts, merged, deps);
  }

  return {
    ok: true,
    received: true,
    event,
    delivery,
    conflicts,
    merged,
  };
}

async function processPushWebhook(
  rawBody: Buffer,
  conflicts: Array<{ id: string; documentId: string; workspaceId: string }>,
  merged: Array<{ documentId: string; workspaceId: string }>,
  deps: {
    repoStore?: RepoLinkStore;
    ingest?: typeof ingestRemoteChange;
  },
): Promise<void> {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
  } catch {
    return;
  }

  const ingest = deps.ingest ?? ingestRemoteChange;

  // Prefer explicit document payloads (local/CI / App contents adapter).
  const mv = payload.markdownviz as
    | {
        documents?: Array<{
          workspaceId?: string;
          documentId?: string;
          path?: string;
          remoteContent?: string;
          remoteSha?: string;
        }>;
      }
    | undefined;

  if (mv?.documents?.length) {
    for (const doc of mv.documents) {
      if (
        !isNonEmptyString(doc.workspaceId) ||
        !isNonEmptyString(doc.path) ||
        !isNonEmptyString(doc.remoteContent) ||
        !isNonEmptyString(doc.remoteSha)
      ) {
        continue;
      }
      const result = await ingest({
        workspaceId: doc.workspaceId.trim(),
        documentId: isNonEmptyString(doc.documentId)
          ? doc.documentId.trim()
          : undefined,
        path: doc.path.trim(),
        remoteContent: doc.remoteContent,
        remoteSha: doc.remoteSha.trim(),
      });
      if (!result.ok) continue;
      if (result.conflict) {
        conflicts.push({
          id: result.conflict.id,
          documentId: result.conflict.documentId,
          workspaceId: result.conflict.workspaceId,
        });
      } else {
        merged.push({
          documentId: result.document.documentId,
          workspaceId: result.document.workspaceId,
        });
      }
    }
  }
}

function headerValue(raw: string | string[] | undefined): string | null {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return null;
}
