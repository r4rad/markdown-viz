/** Matches packages/domain HistoryEvent — local copy so services/api stays dependency-light. */

export type HistoryEventSource =
  | 'save'
  | 'restore'
  | 'sync'
  | 'conflict'
  | 'git_import'
  | 'mcp';

export type HistoryEvent = {
  id: string;
  documentId: string;
  workspaceId: string;
  authorId: string;
  createdAt: number;
  source: HistoryEventSource;
  checksum: string;
  snapshotPath?: string;
  deltaPath?: string;
  gitSha?: string;
};

/** In-memory / Admin record with content for restore + compaction sizing. */
export type HistoryRecord = HistoryEvent & {
  content: string;
  contentBytes: number;
};

export const HISTORY_COMPACTION_EVENTS = 50;
export const HISTORY_COMPACTION_DELTA_BYTES = 1024 * 1024;

export type HistoryBlobKind = 'snap' | 'delta';

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

export function eventsSinceLastSnapshot(events: HistoryEvent[]): number {
  if (events.length === 0) return 0;
  const sorted = [...events].sort((a, b) => a.createdAt - b.createdAt);
  let since = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i]!.snapshotPath) break;
    since += 1;
  }
  return since;
}

export function deltaBytesSinceLastSnapshot(records: HistoryRecord[]): number {
  if (records.length === 0) return 0;
  const sorted = [...records].sort((a, b) => a.createdAt - b.createdAt);
  let bytes = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const e = sorted[i]!;
    if (e.snapshotPath) break;
    bytes += e.contentBytes;
  }
  return bytes;
}

export function planHistoryBlobs(opts: {
  workspaceId: string;
  documentId: string;
  eventId: string;
  existing: HistoryRecord[];
  nextContentBytes: number;
  forceSnapshot?: boolean;
}): { kind: HistoryBlobKind; snapshotPath?: string; deltaPath?: string } {
  const since = eventsSinceLastSnapshot(opts.existing);
  const deltaBytes = deltaBytesSinceLastSnapshot(opts.existing);
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
