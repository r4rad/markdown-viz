import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../middleware/auth.js';
import { getInviteStore, type InviteStore } from '../invites/store.js';
import { getHistoryStore, type HistoryStore } from './store.js';
import {
  planHistoryBlobs,
  type HistoryEvent,
  type HistoryEventSource,
  type HistoryRecord,
} from './types.js';

export type HandlerFail = { ok: false; status: number; error: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function checksumOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

async function resolveMembershipRole(
  store: InviteStore,
  workspaceId: string,
  uid: string,
): Promise<'owner' | 'editor' | 'commentator' | 'viewer' | null> {
  if (await store.isOwner(workspaceId, uid)) return 'owner';
  const membership = await store.getMembership(workspaceId, uid);
  if (!membership) return null;
  return membership.role;
}

function canReadHistory(role: string | null): boolean {
  return role === 'owner' || role === 'editor' || role === 'commentator' || role === 'viewer';
}

function canWriteHistory(role: string | null): boolean {
  return role === 'owner' || role === 'editor';
}

function toPublicEvent(row: HistoryRecord): HistoryEvent {
  const { content: _c, contentBytes: _b, ...event } = row;
  return event;
}

const SOURCES: HistoryEventSource[] = [
  'save',
  'restore',
  'sync',
  'conflict',
  'git_import',
  'mcp',
];

function parseSource(v: unknown): HistoryEventSource | null {
  return typeof v === 'string' && (SOURCES as string[]).includes(v)
    ? (v as HistoryEventSource)
    : null;
}

/**
 * Append an immutable history event (save/sync/conflict/git_import/mcp).
 * Uses periodic snapshots + intervening deltas; never deletes prior events.
 */
export async function appendHistory(
  user: AuthUser,
  documentId: string,
  body: unknown,
  deps: { historyStore?: HistoryStore; inviteStore?: InviteStore; now?: () => number } = {},
): Promise<{ ok: true; event: HistoryEvent } | HandlerFail> {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'invalid_body' };
  }
  const b = body as Record<string, unknown>;
  if (!isNonEmptyString(b.workspaceId)) {
    return { ok: false, status: 400, error: 'workspaceId_required' };
  }
  if (typeof b.content !== 'string') {
    return { ok: false, status: 400, error: 'content_required' };
  }
  const source = parseSource(b.source) ?? 'save';
  if (source === 'restore') {
    return { ok: false, status: 400, error: 'use_restore_endpoint' };
  }

  const inviteStore = deps.inviteStore ?? getInviteStore();
  const role = await resolveMembershipRole(inviteStore, b.workspaceId, user.uid);
  if (!canWriteHistory(role)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  const historyStore = deps.historyStore ?? getHistoryStore();
  const existing = await historyStore.list(b.workspaceId, documentId);
  // list returns newest-first; plan expects chronological for since-count — OK either way
  // because eventsSinceLastSnapshot sorts internally.
  const id = randomUUID();
  const content = b.content;
  const contentBytes = Buffer.byteLength(content, 'utf8');
  const blobs = planHistoryBlobs({
    workspaceId: b.workspaceId,
    documentId,
    eventId: id,
    existing,
    nextContentBytes: contentBytes,
  });

  const newest = existing[0];
  const checksum = checksumOf(content);
  if (newest && newest.checksum === checksum) {
    return { ok: true, event: toPublicEvent(newest) };
  }

  const now = deps.now ?? (() => Date.now());
  const row: HistoryRecord = {
    id,
    documentId,
    workspaceId: b.workspaceId,
    authorId: user.uid,
    createdAt: now(),
    source,
    checksum,
    snapshotPath: blobs.snapshotPath,
    deltaPath: blobs.deltaPath,
    gitSha: isNonEmptyString(b.gitSha) ? b.gitSha : undefined,
    content,
    contentBytes,
  };

  const saved = await historyStore.append(row);
  return { ok: true, event: toPublicEvent(saved) };
}

export async function listHistory(
  user: AuthUser,
  documentId: string,
  workspaceId: string | null,
  deps: { historyStore?: HistoryStore; inviteStore?: InviteStore } = {},
): Promise<{ ok: true; events: HistoryEvent[] } | HandlerFail> {
  if (!workspaceId) {
    return { ok: false, status: 400, error: 'workspaceId_required' };
  }
  const inviteStore = deps.inviteStore ?? getInviteStore();
  const role = await resolveMembershipRole(inviteStore, workspaceId, user.uid);
  if (!canReadHistory(role)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  const historyStore = deps.historyStore ?? getHistoryStore();
  const rows = await historyStore.list(workspaceId, documentId);
  return { ok: true, events: rows.map(toPublicEvent) };
}

/**
 * Restore applies prior content as a *new* history event (source: restore).
 * Prior events are never overwritten or deleted.
 */
export async function restoreHistory(
  user: AuthUser,
  documentId: string,
  body: unknown,
  deps: { historyStore?: HistoryStore; inviteStore?: InviteStore; now?: () => number } = {},
): Promise<{ ok: true; event: HistoryEvent; content: string } | HandlerFail> {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'invalid_body' };
  }
  const b = body as Record<string, unknown>;
  if (!isNonEmptyString(b.workspaceId)) {
    return { ok: false, status: 400, error: 'workspaceId_required' };
  }
  if (!isNonEmptyString(b.eventId)) {
    return { ok: false, status: 400, error: 'eventId_required' };
  }

  const inviteStore = deps.inviteStore ?? getInviteStore();
  const role = await resolveMembershipRole(inviteStore, b.workspaceId, user.uid);
  if (!canWriteHistory(role)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  const historyStore = deps.historyStore ?? getHistoryStore();
  const prior = await historyStore.get(b.eventId);
  if (!prior || prior.documentId !== documentId || prior.workspaceId !== b.workspaceId) {
    return { ok: false, status: 404, error: 'event_not_found' };
  }

  const existing = await historyStore.list(b.workspaceId, documentId);
  const id = randomUUID();
  const contentBytes = prior.contentBytes;
  const blobs = planHistoryBlobs({
    workspaceId: b.workspaceId,
    documentId,
    eventId: id,
    existing,
    nextContentBytes: contentBytes,
    forceSnapshot: true,
  });

  const now = deps.now ?? (() => Date.now());
  const row: HistoryRecord = {
    id,
    documentId,
    workspaceId: b.workspaceId,
    authorId: user.uid,
    createdAt: now(),
    source: 'restore',
    checksum: prior.checksum,
    snapshotPath: blobs.snapshotPath,
    content: prior.content,
    contentBytes,
  };

  const saved = await historyStore.append(row);
  return { ok: true, event: toPublicEvent(saved), content: prior.content };
}
