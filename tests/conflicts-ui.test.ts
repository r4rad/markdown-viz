import { describe, expect, it } from 'vitest';
import { threeWayMerge } from '../src/lib/three-way-merge';
import {
  githubSyncBadgeLabel,
  resolutionFromAction,
  syncStatusLabel,
  tabHasGithubMirror,
} from '../src/lib/github-conflict';
import { shouldScheduleSyncEnqueue } from '../src/lib/github-sync-enqueue';
import type { FileTab, WorkspaceFolder } from '../src/types';

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
  it('labels InSync Ahead Behind Conflict and Off when unset', () => {
    expect(syncStatusLabel('InSync')).toBe('InSync');
    expect(syncStatusLabel('Ahead')).toBe('Ahead');
    expect(syncStatusLabel('Behind')).toBe('Behind');
    expect(syncStatusLabel('Conflict')).toBe('Conflict');
    expect(syncStatusLabel(undefined)).toBe('Off');
    expect(syncStatusLabel(null)).toBe('Off');
  });

  it('does not claim InSync for unlinked personal docs', () => {
    const local = {
      id: 't1',
      name: 'a.md',
      content: '',
      cursorPos: 0,
      scrollTop: 0,
      scrollPreview: 0,
      dirty: false,
      updatedAt: 0,
      createdAt: 0,
      folderId: null,
      origin: { kind: 'local' as const },
      syncStatus: 'InSync' as const,
    } satisfies FileTab;
    expect(tabHasGithubMirror(local, [])).toBe(false);
    expect(githubSyncBadgeLabel(local, [], true)).toBe('Off');
    expect(githubSyncBadgeLabel({ ...local, syncStatus: undefined }, [], true)).toBe('Off');
  });

  it('shows sync state for GitHub-backed tabs when API is configured', () => {
    const gh = {
      id: 't2',
      name: 'b.md',
      content: '',
      cursorPos: 0,
      scrollTop: 0,
      scrollPreview: 0,
      dirty: false,
      updatedAt: 0,
      createdAt: 0,
      folderId: null,
      origin: {
        kind: 'github' as const,
        owner: 'o',
        repo: 'r',
        path: 'b.md',
        ref: 'main',
        sha: 'abc',
      },
      syncStatus: 'Ahead' as const,
    } satisfies FileTab;
    expect(tabHasGithubMirror(gh, [])).toBe(true);
    expect(githubSyncBadgeLabel(gh, [], true)).toBe('Ahead');
    expect(githubSyncBadgeLabel(gh, [], false)).toBe('Off');
  });

  it('treats folder repoLink as a GitHub mirror', () => {
    const folderId = 'f1';
    const folders: WorkspaceFolder[] = [{
      id: folderId,
      name: 'Docs',
      parentId: null,
      createdAt: 0,
      updatedAt: 0,
      repoLink: { owner: 'o', repo: 'r', ref: 'main', pathPrefix: '' },
    }];
    const tab = {
      id: 't3',
      name: 'c.md',
      content: '',
      cursorPos: 0,
      scrollTop: 0,
      scrollPreview: 0,
      dirty: false,
      updatedAt: 0,
      createdAt: 0,
      folderId,
      origin: { kind: 'local' as const },
      syncStatus: 'InSync' as const,
    } satisfies FileTab;
    expect(githubSyncBadgeLabel(tab, folders, true)).toBe('InSync');
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
