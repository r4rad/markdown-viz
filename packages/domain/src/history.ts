import type { HistoryEvent, HistoryEventSource } from './types';

/** Periodic full snapshot every N content events (not a delete cap). */
export const HISTORY_COMPACTION_EVENTS = 50;

/** Also compact when intervening deltas reach ~1 MiB. */
export const HISTORY_COMPACTION_DELTA_BYTES = 1024 * 1024;

export type HistoryBlobKind = 'snap' | 'delta';

/**
 * Cloud Storage object path for a history blob.
 * Example: `history/{ws}/{doc}/{eventId}.snap.zst`
 */
export function historyBlobPath(
  workspaceId: string,
  documentId: string,
  eventId: string,
  kind: HistoryBlobKind,
): string {
  const ext = kind === 'snap' ? 'snap.zst' : 'delta.zst';
  return `history/${workspaceId}/${documentId}/${eventId}.${ext}`;
}

export function shouldCompactSnapshot(opts: {
  eventsSinceLastSnapshot: number;
  deltaBytesSinceLastSnapshot: number;
  eventInterval?: number;
  deltaByteLimit?: number;
}): boolean {
  const interval = opts.eventInterval ?? HISTORY_COMPACTION_EVENTS;
  const limit = opts.deltaByteLimit ?? HISTORY_COMPACTION_DELTA_BYTES;
  return (
    opts.eventsSinceLastSnapshot >= interval ||
    opts.deltaBytesSinceLastSnapshot >= limit
  );
}

/** Count events after the newest snapshot (events with snapshotPath). */
export function eventsSinceLastSnapshot(events: HistoryEvent[]): number {
  if (events.length === 0) return 0;
  const sorted = [...events].sort((a, b) => a.createdAt - b.createdAt);
  let since = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i]!;
    if (e.snapshotPath) break;
    since += 1;
  }
  return since;
}

/** Sum content sizes of delta-only events after the newest snapshot. */
export function deltaBytesSinceLastSnapshot(
  events: HistoryEvent[],
  sizeByEventId: Record<string, number>,
): number {
  if (events.length === 0) return 0;
  const sorted = [...events].sort((a, b) => a.createdAt - b.createdAt);
  let bytes = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i]!;
    if (e.snapshotPath) break;
    bytes += sizeByEventId[e.id] ?? 0;
  }
  return bytes;
}

/**
 * Decide whether the next event should store a full snapshot or a delta,
 * and return Storage object paths. Never implies deletion of prior events.
 */
export function planHistoryBlobs(opts: {
  workspaceId: string;
  documentId: string;
  eventId: string;
  existing: HistoryEvent[];
  nextContentBytes: number;
  sizeByEventId?: Record<string, number>;
  forceSnapshot?: boolean;
}): { kind: HistoryBlobKind; snapshotPath?: string; deltaPath?: string } {
  const sizes = opts.sizeByEventId ?? {};
  const since = eventsSinceLastSnapshot(opts.existing);
  const deltaBytes = deltaBytesSinceLastSnapshot(opts.existing, sizes);
  const first = opts.existing.length === 0;
  const compact =
    opts.forceSnapshot ||
    first ||
    shouldCompactSnapshot({
      eventsSinceLastSnapshot: since + 1,
      deltaBytesSinceLastSnapshot: deltaBytes + opts.nextContentBytes,
    });

  if (compact) {
    return {
      kind: 'snap',
      snapshotPath: historyBlobPath(
        opts.workspaceId,
        opts.documentId,
        opts.eventId,
        'snap',
      ),
    };
  }
  return {
    kind: 'delta',
    deltaPath: historyBlobPath(
      opts.workspaceId,
      opts.documentId,
      opts.eventId,
      'delta',
    ),
  };
}

/** Immutable append — never drops prior history. */
export function appendHistoryEvent(
  existing: HistoryEvent[],
  next: HistoryEvent,
): HistoryEvent[] {
  return [...existing, next];
}

export function buildHistoryEvent(input: {
  id: string;
  documentId: string;
  workspaceId: string;
  authorId: string;
  source: HistoryEventSource;
  checksum: string;
  createdAt?: number;
  snapshotPath?: string;
  deltaPath?: string;
  gitSha?: string;
}): HistoryEvent {
  return {
    id: input.id,
    documentId: input.documentId,
    workspaceId: input.workspaceId,
    authorId: input.authorId,
    createdAt: input.createdAt ?? Date.now(),
    source: input.source,
    checksum: input.checksum,
    snapshotPath: input.snapshotPath,
    deltaPath: input.deltaPath,
    gitSha: input.gitSha,
  };
}

/**
 * Restore always creates a new event (source: restore) pointing at a snapshot
 * of the restored content — prior events are left intact.
 */
export function buildRestoreHistoryEvent(input: {
  id: string;
  documentId: string;
  workspaceId: string;
  authorId: string;
  checksum: string;
  createdAt?: number;
  restoredFromId?: string;
}): HistoryEvent {
  const snapshotPath = historyBlobPath(
    input.workspaceId,
    input.documentId,
    input.id,
    'snap',
  );
  return buildHistoryEvent({
    id: input.id,
    documentId: input.documentId,
    workspaceId: input.workspaceId,
    authorId: input.authorId,
    source: 'restore',
    checksum: input.checksum,
    createdAt: input.createdAt,
    snapshotPath,
  });
}
