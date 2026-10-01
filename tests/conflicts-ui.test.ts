import { describe, expect, it } from 'vitest';
import { threeWayMerge } from '../src/lib/three-way-merge';
import {
  resolutionFromAction,
  syncStatusLabel,
} from '../src/lib/github-conflict';
import { shouldScheduleSyncEnqueue } from '../src/lib/github-sync-enqueue';

describe('three-way merge (SPA)', () => {
  it('auto-merges non-overlapping edits', () => {
    const result = threeWayMerge(
      'a\nb\nc\n',
      'A\nb\nc\n',
      'a\nb\nC\n',
    );
    expect(result.conflict).toBe(false);
    if (result.conflict) return;
    expect(result.merged).toContain('A');
    expect(result.merged).toContain('C');
  });

  it('flags overlapping edits as conflict', () => {
    const result = threeWayMerge('x\n', 'local\n', 'remote\n');
    expect(result.conflict).toBe(true);
  });
});

describe('sync status UX helpers', () => {
  it('labels InSync Ahead Behind Conflict', () => {
    expect(syncStatusLabel('InSync')).toBe('InSync');
    expect(syncStatusLabel('Ahead')).toBe('Ahead');
    expect(syncStatusLabel('Behind')).toBe('Behind');
    expect(syncStatusLabel('Conflict')).toBe('Conflict');
  });

  it('maps keep-local|take-remote|merged to API resolution', () => {
    expect(resolutionFromAction('keep-local')).toBe('local');
    expect(resolutionFromAction('take-remote')).toBe('remote');
    expect(resolutionFromAction('merged')).toBe('merged');
  });

  it('blocks quiet enqueue while Conflict', () => {
    expect(
      shouldScheduleSyncEnqueue({
        apiConfigured: true,
        workspaceId: 'ws-1',
        role: 'editor',
        documentId: 'doc-1',
        syncStatus: 'Conflict',
      }),
    ).toBe(false);
    expect(
      shouldScheduleSyncEnqueue({
        apiConfigured: true,
        workspaceId: 'ws-1',
        role: 'editor',
        documentId: 'doc-1',
        syncStatus: 'Ahead',
      }),
    ).toBe(true);
  });
});
