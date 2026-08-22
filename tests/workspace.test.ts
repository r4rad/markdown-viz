import { describe, it, expect } from 'vitest';
import {
  createFolder,
  deleteFolder,
  migrateTab,
  migrateTabs,
  moveFolder,
  renameFolder,
  assertSafePath,
  normalizePathPrefix,
} from '../src/lib/workspace';
import type { FileTab, WorkspaceFolder } from '../src/types';

function tab(partial: Partial<FileTab> & { id: string; name: string }): FileTab {
  return {
    content: '',
    cursorPos: 0,
    scrollTop: 0,
    scrollPreview: 0,
    dirty: false,
    updatedAt: 1,
    createdAt: 1,
    folderId: null,
    origin: { kind: 'local' },
    ...partial,
  };
}

describe('workspace migration', () => {
  it('fills missing folderId and origin as Unfiled/local', () => {
    const migrated = migrateTab({
      id: 'old',
      name: 'a.md',
      content: 'x',
    } as FileTab);
    expect(migrated.folderId).toBeNull();
    expect(migrated.origin).toEqual({ kind: 'local' });
  });

  it('preserves github origin', () => {
    const migrated = migrateTabs([{
      id: 'g',
      name: 'README.md',
      content: '# hi',
      origin: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', path: 'README.md', sha: 'abc' },
    }]);
    expect(migrated[0].origin.kind).toBe('github');
  });
});

describe('folder tree', () => {
  it('creates nested folders', () => {
    let folders: WorkspaceFolder[] = [];
    folders = createFolder(folders, { name: 'Docs', parentId: null, id: 'root' });
    folders = createFolder(folders, { name: 'API', parentId: 'root', id: 'child' });
    expect(folders).toHaveLength(2);
    expect(folders[1].parentId).toBe('root');
  });

  it('renames and moves folders', () => {
    let folders = createFolder([], { name: 'A', parentId: null, id: 'a' });
    folders = createFolder(folders, { name: 'B', parentId: null, id: 'b' });
    folders = renameFolder(folders, 'a', 'Alpha');
    folders = moveFolder(folders, 'b', 'a');
    expect(folders.find(f => f.id === 'a')?.name).toBe('Alpha');
    expect(folders.find(f => f.id === 'b')?.parentId).toBe('a');
  });

  it('rejects moving a folder into its descendant', () => {
    let folders = createFolder([], { name: 'A', parentId: null, id: 'a' });
    folders = createFolder(folders, { name: 'B', parentId: 'a', id: 'b' });
    expect(() => moveFolder(folders, 'a', 'b')).toThrow(/descendant/);
  });

  it('reparents children and tabs when deleting a folder', () => {
    let folders = createFolder([], { name: 'A', parentId: null, id: 'a' });
    folders = createFolder(folders, { name: 'B', parentId: 'a', id: 'b' });
    const tabs = [tab({ id: 't1', name: 'f.md', folderId: 'a' })];
    const result = deleteFolder(folders, tabs, 'a', 'reparent');
    expect(result.folders.find(f => f.id === 'a')).toBeUndefined();
    expect(result.folders.find(f => f.id === 'b')?.parentId).toBeNull();
    expect(result.tabs[0].folderId).toBeNull();
    expect(result.removedTabIds).toEqual([]);
  });

  it('deletes nested folders and local tabs; does not invent remote deletes', () => {
    let folders = createFolder([], { name: 'A', parentId: null, id: 'a' });
    folders = createFolder(folders, { name: 'B', parentId: 'a', id: 'b' });
    folders = folders.map(f => f.id === 'a' ? { ...f, repoLink: { owner: 'o', repo: 'r' } } : f);
    const tabs = [
      tab({ id: 'local', name: 'a.md', folderId: 'b' }),
      tab({
        id: 'linked',
        name: 'README.md',
        folderId: 'a',
        origin: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', path: 'README.md', sha: '1' },
      }),
    ];
    const result = deleteFolder(folders, tabs, 'a', 'delete-contents');
    expect(result.folders).toHaveLength(0);
    expect(result.tabs).toHaveLength(0);
    expect(result.removedTabIds.sort()).toEqual(['linked', 'local']);
  });
});

describe('path guards', () => {
  it('rejects traversal', () => {
    expect(() => assertSafePath('../secret')).toThrow();
    expect(() => assertSafePath('docs/../../etc')).toThrow();
    expect(normalizePathPrefix('docs/api')).toBe('docs/api');
  });
});
