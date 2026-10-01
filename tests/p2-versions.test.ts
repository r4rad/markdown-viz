import { describe, it, expect } from 'vitest';
import {
  appendVersion,
  assignHistoryStoragePaths,
  capVersions,
  checksumUnchanged,
  snapshotStorageDecision,
  VERSION_CAP,
  LARGE_SNAPSHOT_BYTES,
  restoreApplies,
} from '../src/lib/versions';
import { unifiedDiff } from '../src/lib/unified-diff';
import type { DocVersion } from '../src/types';
import {
  HISTORY_COMPACTION_EVENTS,
  appendHistoryEvent,
  buildHistoryEvent,
  buildRestoreHistoryEvent,
  historyBlobPath,
  planHistoryBlobs,
  shouldCompactSnapshot,
  type HistoryEvent,
} from '@markdown-viz/domain';

function v(partial: Partial<DocVersion> & { id: string; checksum: string; createdAt: number }): DocVersion {
  return {
    fileId: 'f',
    workspaceId: 'ws',
    authorId: 'u',
    source: 'save',
    ...partial,
  };
}

describe('versions', () => {
  it('skips duplicate checksum', () => {
    const existing = [v({ id: '1', checksum: 'aaa', createdAt: 1 })];
    const next = v({ id: '2', checksum: 'aaa', createdAt: 2 });
    const result = appendVersion(existing, next);
    expect(result.skipped).toBe(true);
    expect(result.versions).toHaveLength(1);
    expect(checksumUnchanged('aaa', 'aaa')).toBe(true);
  });

  it('retains more than 50 versions without deleting', () => {
    const versions: DocVersion[] = [];
    for (let i = 0; i < 60; i++) {
      versions.push(v({
        id: `v${i}`,
        checksum: `c${i}`,
        createdAt: i,
        source: i === 10 ? 'restore' : 'save',
      }));
    }
    const kept = capVersions(versions);
    expect(kept).toHaveLength(60);
    expect(kept.find(x => x.id === 'v0')).toBeTruthy();
    expect(kept.find(x => x.id === 'v59')).toBeTruthy();
    expect(kept.find(x => x.id === 'v10' && x.source === 'restore')).toBeTruthy();

    let acc = versions.slice(0, 50);
    const more = appendVersion(acc, v({ id: 'v50', checksum: 'c50', createdAt: 50 }));
    expect(more.skipped).toBe(false);
    expect(more.droppedIds).toEqual([]);
    expect(more.versions).toHaveLength(51);
  });

  it('VERSION_CAP aliases compaction interval, not a delete limit', () => {
    expect(VERSION_CAP).toBe(HISTORY_COMPACTION_EVENTS);
  });

  it('viewer cannot restore; editor can', () => {
    expect(restoreApplies('viewer')).toBe(false);
    expect(restoreApplies('editor')).toBe(true);
  });

  it('large snapshots request storage fallback', () => {
    const big = 'x'.repeat(LARGE_SNAPSHOT_BYTES + 10);
    expect(snapshotStorageDecision(big).storagePathNeeded).toBe(true);
    expect(snapshotStorageDecision('small').storagePathNeeded).toBe(false);
  });

  it('assigns snap vs delta storage paths via compaction', () => {
    const existing: DocVersion[] = [
      v({
        id: 'v0',
        checksum: 'c0',
        createdAt: 0,
        storagePath: 'history/ws/f/v0.snap.zst',
      }),
    ];
    for (let i = 1; i < 50; i++) {
      existing.push(v({
        id: `v${i}`,
        checksum: `c${i}`,
        createdAt: i,
        storagePath: `history/ws/f/v${i}.delta.zst`,
      }));
    }
    const next = v({ id: 'v50', checksum: 'c50', createdAt: 50 });
    const assigned = assignHistoryStoragePaths(existing, next, 100);
    expect(assigned.storagePath).toContain('.snap.zst');
  });

  it('restore forces a snapshot path', () => {
    const existing = [
      v({ id: 'v0', checksum: 'c0', createdAt: 0, storagePath: 'history/ws/f/v0.snap.zst' }),
    ];
    const restore = v({ id: 'r1', checksum: 'c0', createdAt: 1, source: 'restore' });
    const assigned = assignHistoryStoragePaths(existing, restore, 10);
    expect(assigned.storagePath).toContain('.snap.zst');
  });

  it('unified markdown diff', () => {
    const diff = unifiedDiff('a\nb', 'a\nc');
    expect(diff).toContain('-b');
    expect(diff).toContain('+c');
  });
});

describe('domain history helpers', () => {
  it('builds storage paths for snap and delta', () => {
    expect(historyBlobPath('ws', 'doc', 'e1', 'snap')).toBe('history/ws/doc/e1.snap.zst');
    expect(historyBlobPath('ws', 'doc', 'e1', 'delta')).toBe('history/ws/doc/e1.delta.zst');
  });

  it('compacts every 50 events or ~1 MiB deltas', () => {
    expect(shouldCompactSnapshot({
      eventsSinceLastSnapshot: 50,
      deltaBytesSinceLastSnapshot: 0,
    })).toBe(true);
    expect(shouldCompactSnapshot({
      eventsSinceLastSnapshot: 1,
      deltaBytesSinceLastSnapshot: 1024 * 1024,
    })).toBe(true);
    expect(shouldCompactSnapshot({
      eventsSinceLastSnapshot: 3,
      deltaBytesSinceLastSnapshot: 100,
    })).toBe(false);
  });

  it('appendHistoryEvent never drops prior events', () => {
    const events: HistoryEvent[] = [];
    for (let i = 0; i < 60; i++) {
      events.push(buildHistoryEvent({
        id: `h${i}`,
        documentId: 'd',
        workspaceId: 'ws',
        authorId: 'u',
        source: 'save',
        checksum: `c${i}`,
        createdAt: i,
        deltaPath: historyBlobPath('ws', 'd', `h${i}`, 'delta'),
      }));
    }
    const next = buildHistoryEvent({
      id: 'h60',
      documentId: 'd',
      workspaceId: 'ws',
      authorId: 'u',
      source: 'save',
      checksum: 'c60',
      createdAt: 60,
    });
    const all = appendHistoryEvent(events, next);
    expect(all).toHaveLength(61);
    expect(all[0]!.id).toBe('h0');
  });

  it('restore builds a new snapshot event', () => {
    const restored = buildRestoreHistoryEvent({
      id: 'r1',
      documentId: 'd',
      workspaceId: 'ws',
      authorId: 'u',
      checksum: 'chk',
    });
    expect(restored.source).toBe('restore');
    expect(restored.snapshotPath).toBe('history/ws/d/r1.snap.zst');
  });

  it('planHistoryBlobs snapshots first event and after interval', () => {
    const first = planHistoryBlobs({
      workspaceId: 'ws',
      documentId: 'd',
      eventId: 'e0',
      existing: [],
      nextContentBytes: 10,
    });
    expect(first.kind).toBe('snap');

    const afterSnap: HistoryEvent[] = [
      buildHistoryEvent({
        id: 'e0',
        documentId: 'd',
        workspaceId: 'ws',
        authorId: 'u',
        source: 'save',
        checksum: 'c0',
        createdAt: 0,
        snapshotPath: first.snapshotPath,
      }),
    ];
    const delta = planHistoryBlobs({
      workspaceId: 'ws',
      documentId: 'd',
      eventId: 'e1',
      existing: afterSnap,
      nextContentBytes: 10,
    });
    expect(delta.kind).toBe('delta');
  });
});
