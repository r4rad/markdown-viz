import { describe, it, expect, vi } from 'vitest';
import { callTool, type FirestorePort, type GithubPort, type WorkspaceFileDoc } from '../mcp/src/tools';
import { resolveAuthenticatedUser } from '../mcp/src/auth';

function memoryPorts(files: WorkspaceFileDoc[] = []) {
  const store = new Map(files.map(f => [f.id, f]));
  const firestore: FirestorePort = {
    async listFiles() { return [...store.values()]; },
    async listFolders() { return []; },
    async getFile(_uid, id) { return store.get(id) ?? null; },
    async writeFile(_uid, file) { store.set(file.id, file); },
  };
  const put = vi.fn(async () => ({ sha: 'newsha' }));
  const github: GithubPort = {
    async getFile() { return { content: '# remote', sha: 'r1' }; },
    async listMarkdown() { return [{ path: 'README.md', sha: 'r1' }]; },
    putFile: put,
  };
  return { firestore, github, put, store };
}

describe('MCP auth', () => {
  it('rejects missing credentials', async () => {
    const result = await resolveAuthenticatedUser({});
    expect('error' in result).toBe(true);
  });

  it('rejects token without API key', async () => {
    const result = await resolveAuthenticatedUser({ MARKDOWNVIZ_FIREBASE_ID_TOKEN: 'x' });
    expect('error' in result).toBe(true);
  });

  it('does not accept raw uid unless unverified flag is set', async () => {
    const denied = await resolveAuthenticatedUser({ MARKDOWNVIZ_USER_ID: 'u1' });
    expect('error' in denied).toBe(true);
    const allowed = await resolveAuthenticatedUser({
      MARKDOWNVIZ_USER_ID: 'u1',
      MARKDOWNVIZ_ALLOW_UNVERIFIED_UID: '1',
    });
    expect(allowed).toEqual({ uid: 'u1' });
  });
});

describe('MCP tools', () => {
  it('write_file on github origin does not call Contents API', async () => {
    const file: WorkspaceFileDoc = {
      id: 'g1',
      name: 'README.md',
      content: 'old',
      folderId: null,
      origin: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', path: 'README.md', sha: 'abc' },
      updatedAt: 1,
      createdAt: 1,
    };
    const { firestore, github, put } = memoryPorts([file]);
    const result = await callTool('write_file', { fileId: 'g1', name: 'README.md', content: 'new' }, {
      uid: 'user-a',
      githubToken: 'tok',
      firestore,
      github,
    });
    expect(put).not.toHaveBeenCalled();
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toMatch(/overlay/);
  });

  it('save_to_connector github calls putFile', async () => {
    const file: WorkspaceFileDoc = {
      id: 'g1',
      name: 'README.md',
      content: 'new',
      folderId: null,
      origin: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', path: 'README.md', sha: 'abc' },
      updatedAt: 1,
      createdAt: 1,
    };
    const { firestore, github, put } = memoryPorts([file]);
    const result = await callTool('save_to_connector', { connector: 'github', fileId: 'g1' }, {
      uid: 'user-a',
      githubToken: 'tok',
      firestore,
      github,
    });
    expect(put).toHaveBeenCalled();
    expect(result.content[0].text).toMatch(/newsha/);
  });

  it('save_to_connector drive is NOT_IMPLEMENTED', async () => {
    const { firestore, github } = memoryPorts();
    const result = await callTool('save_to_connector', { connector: 'drive' }, {
      uid: 'user-a',
      firestore,
      github,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/NOT_IMPLEMENTED/);
  });

  it('write_file uses the authenticated uid only', async () => {
    const { firestore, github } = memoryPorts();
    const spy = vi.spyOn(firestore, 'writeFile');
    await callTool('write_file', { name: 'a.md', content: 'x' }, {
      uid: 'user-a',
      firestore,
      github,
    });
    expect(spy.mock.calls[0][0]).toBe('user-a');
  });

  it('rejects traversal in save path', async () => {
    const { firestore, github, put } = memoryPorts();
    const result = await callTool('save_to_connector', {
      connector: 'github',
      owner: 'o',
      repo: 'r',
      path: '../secret.md',
      ref: 'main',
      content: 'x',
    }, { uid: 'user-a', githubToken: 't', firestore, github });
    expect(put).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });
});
