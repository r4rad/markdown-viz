import { describe, it, expect } from 'vitest';
import {
  formatHistoryTime,
  gitCommitUrl,
  resolveRepoLink,
  shortAuthor,
  shortSha,
  sortHistoryNewestFirst,
  versionGitSha,
} from '../src/lib/history-ui';
import { restoreApplies } from '../src/lib/versions';
import type { DocVersion } from '../src/types';

function v(partial: Partial<DocVersion> & { id: string; createdAt: number }): DocVersion {
  return {
    fileId: 'f',
    workspaceId: 'ws',
    authorId: 'user-abcdef012345',
    source: 'save',
    checksum: 'c',
    ...partial,
  };
}

describe('history panel helpers', () => {
  it('lists newest-first', () => {
    const sorted = sortHistoryNewestFirst([
      v({ id: 'a', createdAt: 1 }),
      v({ id: 'b', createdAt: 3 }),
      v({ id: 'c', createdAt: 2 }),
    ]);
    expect(sorted.map(x => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('builds optional Git SHA commit links from repo context', () => {
    expect(gitCommitUrl('abc1234deadbeef', { owner: 'acme', repo: 'docs' }))
      .toBe('https://github.com/acme/docs/commit/abc1234deadbeef');
    expect(gitCommitUrl('abc', null)).toBeNull();
    expect(gitCommitUrl(undefined, { owner: 'acme', repo: 'docs' })).toBeNull();
  });

  it('resolves repo from file origin or folder link', () => {
    expect(resolveRepoLink(
      { origin: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', path: 'a.md', sha: 's' }, folderId: null },
      [],
    )).toEqual({ owner: 'o', repo: 'r', ref: 'main' });

    expect(resolveRepoLink(
      { origin: { kind: 'local' }, folderId: 'fld' },
      [{ id: 'fld', name: 'F', parentId: null, createdAt: 0, updatedAt: 0, repoLink: { owner: 'x', repo: 'y' } }],
    )).toEqual({ owner: 'x', repo: 'y' });
  });

  it('surfaces version gitSha for display', () => {
    expect(versionGitSha(v({ id: '1', createdAt: 1, gitSha: 'deadbeef' }))).toBe('deadbeef');
    expect(shortSha('deadbeefcafe')).toBe('deadbee');
    expect(shortAuthor('user-abcdef012345')).toContain('…');
    expect(formatHistoryTime(0)).toBeTruthy();
  });

  it('denies restore for viewers; allows editors', () => {
    expect(restoreApplies('viewer')).toBe(false);
    expect(restoreApplies('commentator')).toBe(false);
    expect(restoreApplies('editor')).toBe(true);
    expect(restoreApplies('owner')).toBe(true);
  });
});
