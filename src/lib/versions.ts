import { canWriteWorkspace } from './workspace-acl';
import {
  HISTORY_COMPACTION_EVENTS,
  planHistoryBlobs,
  type HistoryEvent,
} from '@markdown-viz/domain';
import type { DocVersion, Role, VersionSource } from '../types';

/**
 * Compaction interval (snapshot every N events) — not a delete cap.
 * Kept as VERSION_CAP alias for older call sites / tests.
 */
export const VERSION_CAP = HISTORY_COMPACTION_EVENTS;
export const LARGE_SNAPSHOT_BYTES = 800 * 1024;

export function checksumUnchanged(previous: string | undefined, next: string): boolean {
  return !!previous && previous === next;
}

export function snapshotStorageDecision(content: string): { content?: string; storagePathNeeded: boolean } {
  const bytes = new TextEncoder().encode(content).length;
  if (bytes > LARGE_SNAPSHOT_BYTES) {
    return { storagePathNeeded: true };
  }
  return { content, storagePathNeeded: false };
}

export function buildVersion(input: {
  fileId: string;
  workspaceId: DocVersion['workspaceId'];
  authorId: string;
  source: VersionSource;
  checksum: string;
  content: string;
  now?: number;
  id?: string;
}): { version: DocVersion; skipped: boolean; previousChecksum?: string } & { storagePathNeeded: boolean } {
  const store = snapshotStorageDecision(input.content);
  const version: DocVersion = {
    id: input.id ?? crypto.randomUUID(),
    fileId: input.fileId,
    workspaceId: input.workspaceId,
    authorId: input.authorId,
    createdAt: input.now ?? Date.now(),
    source: input.source,
    checksum: input.checksum,
    content: store.storagePathNeeded ? undefined : store.content,
    storagePath: store.storagePathNeeded
      ? `workspaces/${input.workspaceId}/versions/${input.fileId}/${input.id ?? 'pending'}.md`
      : undefined,
  };
  return { version, skipped: false, storagePathNeeded: store.storagePathNeeded };
}

/**
 * Append a version without deleting prior history.
 * Duplicate checksums (newest) are skipped.
 */
export function appendVersion(
  existing: DocVersion[],
  next: DocVersion,
): { versions: DocVersion[]; skipped: boolean; droppedIds: string[] } {
  const newest = [...existing].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (checksumUnchanged(newest?.checksum, next.checksum)) {
    return { versions: existing, skipped: true, droppedIds: [] };
  }
  return { versions: [...existing, next], skipped: false, droppedIds: [] };
}

/**
 * Unlimited retention — never drop prior history.
 * (Formerly enforced a 50-version delete cap.)
 */
export function capVersions(versions: DocVersion[]): DocVersion[] {
  return [...versions].sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Assign snapshot vs delta Storage paths from HistoryEvent compaction rules.
 * Restore always forces a full snapshot path.
 */
export function assignHistoryStoragePaths(
  existing: DocVersion[],
  next: DocVersion,
  contentBytes: number,
): DocVersion {
  const asEvents: HistoryEvent[] = existing.map(docVersionToHistoryEvent);
  const blobs = planHistoryBlobs({
    workspaceId: String(next.workspaceId),
    documentId: next.fileId,
    eventId: next.id,
    existing: asEvents,
    nextContentBytes: contentBytes,
    forceSnapshot: next.source === 'restore',
  });
  return {
    ...next,
    storagePath: blobs.snapshotPath ?? blobs.deltaPath ?? next.storagePath,
  };
}

export function docVersionToHistoryEvent(v: DocVersion): HistoryEvent {
  const isSnap =
    v.source === 'restore' ||
    (typeof v.storagePath === 'string' && v.storagePath.includes('.snap.'));
  return {
    id: v.id,
    documentId: v.fileId,
    workspaceId: String(v.workspaceId),
    authorId: v.authorId,
    createdAt: v.createdAt,
    source: v.source === 'mcp' ? 'mcp' : v.source === 'sync' ? 'sync' : v.source === 'restore' ? 'restore' : 'save',
    checksum: v.checksum,
    snapshotPath: isSnap ? v.storagePath : undefined,
    deltaPath: !isSnap && v.storagePath ? v.storagePath : undefined,
  };
}

export function restoreApplies(role: Role | null): boolean {
  return canWriteWorkspace(role);
}
