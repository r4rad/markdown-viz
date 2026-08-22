import { describe, it, expect, vi } from 'vitest';
import { callTool, type FirestorePort, type GithubPort, type Phase2Port, type WorkspaceFileDoc } from '../mcp/src/tools';

function ports() {
  const firestore: FirestorePort = {
    async listFiles() { return []; },
    async listFolders() { return []; },
    async getFile() { return null; },
    async writeFile() {},
  };
  const github: GithubPort = {
    async getFile() { return { content: '', sha: '' }; },
    async listMarkdown() { return []; },
    async putFile() { return { sha: '' }; },
  };
  return { firestore, github };
}

describe('MCP phase 2', () => {
  it('invite_member is owner-gated via phase2 port', async () => {
    const { firestore, github } = ports();
    const phase2: Phase2Port = {
      async listWorkspaces() { return []; },
      async inviteMember(_uid, _ws, _who, _role) { return { ok: false, error: 'Only the owner can invite members' }; },
      async getRole() { return 'editor'; },
      async listVersions() { return []; },
      async restoreVersion() { return { ok: false, error: 'denied' }; },
      async syncWiki() { return { ok: false, error: 'Viewers cannot sync wiki' }; },
      async writeSharedFile() { return { ok: false, error: 'denied' }; },
      async queryActivity() { return { ok: false, error: 'Owner-only' }; },
      async recordActivity() {},
    };
    const invite = await callTool('invite_member', { workspaceId: 'w', emailOrUid: 'a@b.c', role: 'editor' }, {
      uid: 'u', firestore, github, phase2,
    });
    expect(invite.isError).toBe(true);
  });

  it('viewer write_file on shared workspace is denied and sync_wiki denied', async () => {
    const { firestore, github } = ports();
    const recordActivity = vi.fn();
    const phase2: Phase2Port = {
      async listWorkspaces() { return [{ id: 'w', name: 'N', role: 'viewer' }]; },
      async inviteMember() { return { ok: false }; },
      async getRole() { return 'viewer'; },
      async listVersions() { return []; },
      async restoreVersion() { return { ok: false, error: 'Viewers cannot restore' }; },
      async syncWiki() { return { ok: false, error: 'Viewers cannot sync wiki' }; },
      async writeSharedFile() { return { ok: false }; },
      async queryActivity() { return { ok: false, error: 'Owner-only' }; },
      recordActivity,
    };
    const write = await callTool('write_file', { workspaceId: 'w', name: 'a.md', content: 'x' }, {
      uid: 'u', firestore, github, phase2,
    });
    expect(write.isError).toBe(true);
    expect(recordActivity).not.toHaveBeenCalled();
    const sync = await callTool('sync_wiki', { workspaceId: 'w', direction: 'pull', connector: 'notion' }, {
      uid: 'u', firestore, github, phase2,
    });
    expect(sync.isError).toBe(true);
    const act = await callTool('activity_query', { workspaceId: 'w' }, { uid: 'u', firestore, github, phase2 });
    expect(act.isError).toBe(true);
  });

  it('owner activity_query returns rows; editor restore can succeed', async () => {
    const { firestore, github } = ports();
    const phase2: Phase2Port = {
      async listWorkspaces() { return [{ id: 'w', name: 'N', role: 'owner' }]; },
      async inviteMember() { return { ok: true }; },
      async getRole(uid) { return uid === 'owner' ? 'owner' : 'editor'; },
      async listVersions() { return [{ id: 'v1' }]; },
      async restoreVersion(uid) { return uid === 'viewer' ? { ok: false } : { ok: true }; },
      async syncWiki() { return { ok: true }; },
      async writeSharedFile() { return { ok: true }; },
      async queryActivity(uid) {
        if (uid !== 'owner') return { ok: false, error: 'Owner-only' };
        return { ok: true, events: [{ action: 'edit', actorId: 'a' }] };
      },
      async recordActivity() {},
    };
    const q = await callTool('activity_query', { workspaceId: 'w' }, {
      uid: 'owner', firestore, github, phase2,
    });
    expect(q.isError).toBeFalsy();
    expect(q.content[0].text).toMatch(/edit/);
  });

  it('mcp_write is tagged on shared write', async () => {
    const { firestore, github } = ports();
    const recordActivity = vi.fn();
    const phase2: Phase2Port = {
      async listWorkspaces() { return []; },
      async inviteMember() { return { ok: true }; },
      async getRole() { return 'editor'; },
      async listVersions() { return []; },
      async restoreVersion() { return { ok: true }; },
      async syncWiki() { return { ok: true }; },
      async writeSharedFile() { return { ok: true }; },
      async queryActivity() { return { ok: true, events: [] }; },
      recordActivity,
    };
    await callTool('write_file', { workspaceId: 'w', name: 'a.md', content: 'n' }, {
      uid: 'ed', firestore, github, phase2,
    });
    expect(recordActivity).toHaveBeenCalled();
    expect(recordActivity.mock.calls[0][0]).toMatchObject({ action: 'mcp_write', source: 'mcp' });
  });
});
