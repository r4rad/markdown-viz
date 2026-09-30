import { canWriteWorkspace } from './workspace-acl';
import type { DocVersion, Role, VersionSource } from '../types';

export const VERSION_CAP = 50;
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

export function appendVersion(
  existing: DocVersion[],
  next: DocVersion,
): { versions: DocVersion[]; skipped: boolean; droppedIds: string[] } {
  const newest = [...existing].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (checksumUnchanged(newest?.checksum, next.checksum)) {
    return { versions: existing, skipped: true, droppedIds: [] };
  }
  return { versions: capVersions([...existing, next]), skipped: false, droppedIds: [] };
}

/** Keep at most 50; never drop the latest or the most recent restore point. */
export function capVersions(versions: DocVersion[]): DocVersion[] {
  if (versions.length <= VERSION_CAP) return versions;
  const sorted = [...versions].sort((a, b) => a.createdAt - b.createdAt);
  const latest = sorted[sorted.length - 1];
  const restorePoints = sorted.filter(v => v.source === 'restore');
  const recentRestore = restorePoints[restorePoints.length - 1];
  const protectedIds = new Set<string>([latest.id]);
  if (recentRestore) protectedIds.add(recentRestore.id);

  const droppable = sorted.filter(v => !protectedIds.has(v.id));
  const keepCount = VERSION_CAP - protectedIds.size;
  const keptDroppable = droppable.slice(Math.max(0, droppable.length - keepCount));
  const keptIds = new Set([...protectedIds, ...keptDroppable.map(v => v.id)]);
  return sorted.filter(v => keptIds.has(v.id));
}

export function restoreApplies(role: Role | null): boolean {
  return canWriteWorkspace(role);
}
