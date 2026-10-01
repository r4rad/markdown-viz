import { createHash, randomUUID } from 'node:crypto';
import type { AuthUser } from '../middleware/auth.js';
import { getInviteStore, type InviteStore } from '../invites/store.js';
import { getSyncJobStore, type SyncJobStore } from '../sync/store.js';
import { threeWayMerge } from '../sync/merge.js';
import {
  getConflictStore,
  getDocumentSyncStore,
  type ConflictStore,
  type DocumentSyncStore,
} from './store.js';
import type {
  ConflictRecord,
  ConflictResolution,
  DocumentSyncState,
  SyncStatus,
} from './types.js';

export type HandlerFail = { ok: false; status: number; error: string };
export type IngestOk = {
  ok: true;
  syncStatus: SyncStatus;
  conflict: ConflictRecord | null;
  document: DocumentSyncState;
};
export type ResolveOk = {
  ok: true;
  conflict: ConflictRecord;
  document: DocumentSyncState;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function checksumOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

/** editor+ — mirrors domain canSyncWiki / canWriteWorkspace. */
async function resolveEditorPlusRole(
  store: InviteStore,
  workspaceId: string,
  uid: string,
): Promise<'owner' | 'editor' | null> {
  if (await store.isOwner(workspaceId, uid)) return 'owner';
  const membership = await store.getMembership(workspaceId, uid);
  if (membership?.role === 'owner' || membership?.role === 'editor') {
    return membership.role;
  }
  return null;
}

/**
 * Seed / update local cloud document mirror state (called after autosave or tests).
 */
export async function upsertDocumentSync(
  input: {
    documentId: string;
    workspaceId: string;
    path: string;
    localContent: string;
    baseContent?: string;
    baseSha?: string;
    remoteContent?: string;
    remoteSha?: string;
    syncStatus?: SyncStatus;
  },
  deps: { docStore?: DocumentSyncStore; now?: () => number } = {},
): Promise<DocumentSyncState> {
  const docStore = deps.docStore ?? getDocumentSyncStore();
  const now = deps.now ?? (() => Date.now());
  const existing = await docStore.get(input.workspaceId, input.documentId);
  const baseContent = input.baseContent ?? existing?.baseContent ?? input.localContent;
  const baseSha = input.baseSha ?? existing?.baseSha ?? `base-${checksumOf(baseContent)}`;
  const remoteContent = input.remoteContent ?? existing?.remoteContent ?? baseContent;
  const remoteSha = input.remoteSha ?? existing?.remoteSha ?? baseSha;
  const localChecksum = checksumOf(input.localContent);

  let syncStatus: SyncStatus =
    input.syncStatus ?? existing?.syncStatus ?? 'InSync';
  if (!input.syncStatus && existing?.syncStatus !== 'Conflict') {
    const localChanged = input.localContent !== baseContent;
    const remoteChanged = remoteContent !== baseContent;
    if (localChanged && remoteChanged && input.localContent !== remoteContent) {
      syncStatus = 'Ahead'; // overlap decided by ingestRemoteChange
    } else if (localChanged) {
      syncStatus = 'Ahead';
    } else if (remoteChanged) {
      syncStatus = 'Behind';
    } else {
      syncStatus = 'InSync';
    }
  }

  const state: DocumentSyncState = {
    documentId: input.documentId,
    workspaceId: input.workspaceId,
    path: input.path.replace(/^\/+/, ''),
    syncStatus,
    baseContent,
    baseSha,
    localContent: input.localContent,
    localChecksum,
    remoteContent,
    remoteSha,
    openConflictId: existing?.openConflictId,
    updatedAt: now(),
  };
  return docStore.upsert(state);
}

/**
 * Apply a remote push change for one document: auto-merge or durable Conflict.
 * Blocks autosync by setting syncStatus=Conflict and SyncJob blocked_conflict.
 */
export async function ingestRemoteChange(
  input: {
    workspaceId: string;
    documentId?: string;
    path: string;
    remoteContent: string;
    remoteSha: string;
  },
  deps: {
    docStore?: DocumentSyncStore;
    conflictStore?: ConflictStore;
    jobStore?: SyncJobStore;
    now?: () => number;
  } = {},
): Promise<IngestOk | HandlerFail> {
  const docStore = deps.docStore ?? getDocumentSyncStore();
  const conflictStore = deps.conflictStore ?? getConflictStore();
  const jobStore = deps.jobStore ?? getSyncJobStore();
  const now = deps.now ?? (() => Date.now());

  const path = input.path.replace(/^\/+/, '');
  const existing = input.documentId
    ? await docStore.get(input.workspaceId, input.documentId)
    : await docStore.findByPath(input.workspaceId, path);

  if (!existing) {
    // First sight of remote file — adopt as InSync mirror.
    const adopted = await upsertDocumentSync(
      {
        documentId: input.documentId ?? randomUUID(),
        workspaceId: input.workspaceId,
        path,
        localContent: input.remoteContent,
        baseContent: input.remoteContent,
        baseSha: input.remoteSha,
        remoteContent: input.remoteContent,
        remoteSha: input.remoteSha,
        syncStatus: 'InSync',
      },
      { docStore, now },
    );
    return { ok: true, syncStatus: 'InSync', conflict: null, document: adopted };
  }

  const merge = threeWayMerge(
    existing.baseContent,
    existing.localContent,
    input.remoteContent,
  );

  if (merge.ok) {
    const document = await docStore.upsert({
      ...existing,
      path,
      localContent: merge.merged,
      localChecksum: checksumOf(merge.merged),
      remoteContent: input.remoteContent,
      remoteSha: input.remoteSha,
      baseContent: merge.merged,
      baseSha: input.remoteSha,
      syncStatus: 'InSync',
      openConflictId: undefined,
      updatedAt: now(),
    });
    return { ok: true, syncStatus: 'InSync', conflict: null, document };
  }

  // Overlap → durable Conflict; block autosync.
  const existingOpen = await conflictStore.findOpenByDocument(
    existing.workspaceId,
    existing.documentId,
  );
  const conflict: ConflictRecord = existingOpen
    ? {
        ...existingOpen,
        remoteSha: input.remoteSha,
        localChecksum: existing.localChecksum,
        remoteContent: input.remoteContent,
        localContent: existing.localContent,
        baseContent: existing.baseContent,
        conflictedPreview: merge.conflicted,
      }
    : {
        id: randomUUID(),
        documentId: existing.documentId,
        workspaceId: existing.workspaceId,
        baseSha: existing.baseSha,
        localChecksum: existing.localChecksum,
        remoteSha: input.remoteSha,
        status: 'open',
        path,
        baseContent: existing.baseContent,
        localContent: existing.localContent,
        remoteContent: input.remoteContent,
        conflictedPreview: merge.conflicted,
        createdAt: now(),
      };

  if (existingOpen) {
    await conflictStore.updateConflict(conflict);
  } else {
    await conflictStore.createConflict(conflict);
  }

  const document = await docStore.upsert({
    ...existing,
    path,
    remoteContent: input.remoteContent,
    remoteSha: input.remoteSha,
    syncStatus: 'Conflict',
    openConflictId: conflict.id,
    updatedAt: now(),
  });

  // Mark any active SyncJobs as blocked_conflict.
  const active = await jobStore.findActiveByDocument(
    existing.workspaceId,
    existing.documentId,
  );
  if (active) {
    await jobStore.updateJob({ ...active, state: 'blocked_conflict' });
  }
  // Also mark recent queued/running jobs listed for the workspace.
  const jobs = await jobStore.listJobs(existing.workspaceId);
  for (const job of jobs) {
    if (
      job.documentId === existing.documentId &&
      (job.state === 'queued' || job.state === 'running')
    ) {
      await jobStore.updateJob({ ...job, state: 'blocked_conflict' });
    }
  }

  return { ok: true, syncStatus: 'Conflict', conflict, document };
}

/**
 * Editor resolves keep-local | take-remote | merged; clears Conflict and resumes sync.
 */
export async function resolveConflict(
  user: AuthUser,
  conflictId: string,
  body: unknown,
  deps: {
    conflictStore?: ConflictStore;
    docStore?: DocumentSyncStore;
    inviteStore?: InviteStore;
    now?: () => number;
  } = {},
): Promise<ResolveOk | HandlerFail> {
  if (!isNonEmptyString(conflictId)) {
    return { ok: false, status: 400, error: 'conflict_id_required' };
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'invalid_body' };
  }

  const { resolution, mergedContent } = body as Record<string, unknown>;
  if (
    resolution !== 'local' &&
    resolution !== 'remote' &&
    resolution !== 'merged'
  ) {
    return { ok: false, status: 400, error: 'resolution_required' };
  }
  if (resolution === 'merged' && !isNonEmptyString(mergedContent)) {
    return { ok: false, status: 400, error: 'merged_content_required' };
  }

  const conflictStore = deps.conflictStore ?? getConflictStore();
  const docStore = deps.docStore ?? getDocumentSyncStore();
  const inviteStore = deps.inviteStore ?? getInviteStore();
  const now = deps.now ?? (() => Date.now());

  const conflict = await conflictStore.getConflict(conflictId.trim());
  if (!conflict) {
    return { ok: false, status: 404, error: 'conflict_not_found' };
  }
  if (conflict.status === 'resolved') {
    const document = await docStore.get(conflict.workspaceId, conflict.documentId);
    if (!document) {
      return { ok: false, status: 404, error: 'document_not_found' };
    }
    return { ok: true, conflict, document };
  }

  const role = await resolveEditorPlusRole(
    inviteStore,
    conflict.workspaceId,
    user.uid,
  );
  if (!role) {
    return { ok: false, status: 403, error: 'editor_required' };
  }

  const res = resolution as ConflictResolution;
  let nextContent: string;
  if (res === 'local') nextContent = conflict.localContent;
  else if (res === 'remote') nextContent = conflict.remoteContent;
  else nextContent = String(mergedContent);

  const resolved: ConflictRecord = {
    ...conflict,
    status: 'resolved',
    resolution: res,
    resolvedAt: now(),
  };
  await conflictStore.updateConflict(resolved);

  const existing = await docStore.get(conflict.workspaceId, conflict.documentId);
  const document = await docStore.upsert({
    documentId: conflict.documentId,
    workspaceId: conflict.workspaceId,
    path: existing?.path ?? conflict.path,
    syncStatus: res === 'local' ? 'Ahead' : 'InSync',
    baseContent: nextContent,
    baseSha:
      res === 'remote'
        ? conflict.remoteSha
        : `resolved-${checksumOf(nextContent)}`,
    localContent: nextContent,
    localChecksum: checksumOf(nextContent),
    remoteContent: conflict.remoteContent,
    remoteSha: conflict.remoteSha,
    openConflictId: undefined,
    updatedAt: now(),
  });

  return { ok: true, conflict: resolved, document };
}
