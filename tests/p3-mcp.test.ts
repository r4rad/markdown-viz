import { describe, it, expect } from 'vitest';
import { callTool, type FirestorePort, type GithubPort, type Phase2Port, type TemplatePort } from '../mcp/src/tools';

function base() {
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

describe('MCP templates', () => {
  it('lists templates', async () => {
    const { firestore, github } = base();
    const templates: TemplatePort = {
      list: () => [{ id: 'engineering/prd', pack: 'engineering', docType: 'prd', title: 'PRD' }],
      async create() { return { ok: true, fileId: 'f1', folderId: 'eng' }; },
    };
    const listed = await callTool('list_templates', {}, { uid: 'u', firestore, github, templates });
    expect(listed.content[0].text).toMatch(/prd/);
  });

  it('create_from_template returns ids and rejects viewers', async () => {
    const { firestore, github } = base();
    const templates: TemplatePort = {
      list: () => [],
      async create() { return { ok: true, fileId: 'n1', folderId: 'notes' }; },
    };
    const phase2: Phase2Port = {
      async listWorkspaces() { return []; },
      async inviteMember() { return { ok: true }; },
      async getRole() { return 'viewer'; },
      async listVersions() { return []; },
      async restoreVersion() { return { ok: true }; },
      async syncWiki() { return { ok: true }; },
      async writeSharedFile() { return { ok: true }; },
      async queryActivity() { return { ok: true, events: [] }; },
      async recordActivity() {},
    };
    const denied = await callTool('create_from_template', {
      workspaceId: 'w', title: 'N', docType: 'note',
    }, { uid: 'v', firestore, github, templates, phase2 });
    expect(denied.isError).toBe(true);

    const ok = await callTool('create_from_template', {
      title: 'N', docType: 'note', extra: { url: 'https://x' },
    }, { uid: 'e', firestore, github, templates });
    expect(ok.isError).toBeFalsy();
    expect(ok.content[0].text).toMatch(/n1/);
  });
});
