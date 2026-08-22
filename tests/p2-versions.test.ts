import { describe, it, expect } from 'vitest';
import { appendVersion, capVersions, checksumUnchanged, snapshotStorageDecision, VERSION_CAP, LARGE_SNAPSHOT_BYTES } from '../src/lib/versions';
import { restoreApplies } from '../src/lib/versions';
import { unifiedDiff } from '../src/lib/unified-diff';
import type { DocVersion } from '../src/types';

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

  it('caps at 50 keeping latest and recent restore', () => {
    const versions: DocVersion[] = [];
    for (let i = 0; i < 60; i++) {
      versions.push(v({
        id: `v${i}`,
        checksum: `c${i}`,
        createdAt: i,
        source: i === 10 ? 'restore' : 'save',
      }));
    }
    const capped = capVersions(versions);
    expect(capped.length).toBeLessThanOrEqual(VERSION_CAP);
    expect(capped.find(x => x.id === 'v59')).toBeTruthy();
    expect(capped.find(x => x.id === 'v10' && x.source === 'restore')).toBeTruthy();
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

  it('unified markdown diff', () => {
    const diff = unifiedDiff('a\nb', 'a\nc');
    expect(diff).toContain('-b');
    expect(diff).toContain('+c');
  });
});
