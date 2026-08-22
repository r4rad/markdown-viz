import { assertSafePath } from '../../src/lib/workspace';

export interface WorkspaceFileDoc {
  id: string;
  name: string;
  content: string;
  folderId: string | null;
  origin: { kind: 'local' } | {
    kind: 'github';
    owner: string;
    repo: string;
    ref: string;
    path: string;
    sha: string;
  };
  updatedAt: number;
  createdAt: number;
}

export interface FolderDoc {
  id: string;
  name: string;
  parentId: string | null;
  repoLink?: { owner: string; repo: string; ref?: string; pathPrefix?: string } | null;
}

export interface FirestorePort {
  listFiles(uid: string): Promise<WorkspaceFileDoc[]>;
  listFolders(uid: string): Promise<FolderDoc[]>;
  getFile(uid: string, id: string): Promise<WorkspaceFileDoc | null>;
  writeFile(uid: string, file: WorkspaceFileDoc): Promise<void>;
}

export interface Phase2Port {
  listWorkspaces(uid: string): Promise<Array<{ id: string; name: string; role: string }>>;
  inviteMember(uid: string, workspaceId: string, emailOrUid: string, role: string): Promise<{ ok: boolean; error?: string }>;
  getRole(uid: string, workspaceId: string): Promise<string | null>;
  listVersions(workspaceId: string, fileId: string): Promise<unknown[]>;
  restoreVersion(uid: string, workspaceId: string, fileId: string, versionId: string): Promise<{ ok: boolean; error?: string }>;
  syncWiki(uid: string, args: Record<string, unknown>): Promise<{ ok: boolean; conflict?: boolean; error?: string }>;
  writeSharedFile(uid: string, workspaceId: string, file: WorkspaceFileDoc): Promise<{ ok: boolean; error?: string }>;
  queryActivity(uid: string, workspaceId: string, filters: Record<string, unknown>): Promise<{ ok: boolean; error?: string; events?: unknown[] }>;
  recordActivity(event: Record<string, unknown>): Promise<void>;
}

export interface GithubPort {
  getFile(owner: string, repo: string, path: string, ref: string): Promise<{ content: string; sha: string }>;
  listMarkdown(owner: string, repo: string, ref: string | undefined, prefix: string | undefined): Promise<Array<{ path: string; sha: string }>>;
  putFile(input: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
    branch: string;
    sha?: string;
  }): Promise<{ sha: string }>;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
}

export const TOOL_DEFS = [
  {
    name: 'list_tree',
    description: 'List folders and local workspace files (ids, names, folderId) for the authenticated user.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_folder',
    description: 'List local files in a folder plus linked GitHub Markdown paths when a repo link exists.',
    inputSchema: {
      type: 'object',
      properties: { folderId: { type: 'string', description: 'Folder id or empty for Unfiled' } },
    },
  },
  {
    name: 'read_file',
    description: 'Read a local Firestore file by id, or a GitHub file via owner/repo/path/ref.',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string' },
        ref: { type: 'string' },
      },
    },
  },
  {
    name: 'write_file',
    description: 'Create or update a local workspace Markdown file in Firestore only. Does not commit to GitHub. For github-origin files this stores a local overlay; call save_to_connector to persist to git.',
    inputSchema: {
      type: 'object',
      required: ['name', 'content'],
      properties: {
        fileId: { type: 'string' },
        name: { type: 'string' },
        content: { type: 'string' },
        folderId: { type: ['string', 'null'] },
      },
    },
  },
  {
    name: 'list_connectors',
    description: 'List save connectors. GitHub is available when GITHUB_TOKEN is set. Drive is a stub.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'save_to_connector',
    description: 'Explicitly save to a connector. github commits via the Contents API. drive returns NOT_IMPLEMENTED. Required to persist linked files to git.',
    inputSchema: {
      type: 'object',
      required: ['connector'],
      properties: {
        connector: { type: 'string' },
        fileId: { type: 'string' },
        content: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string' },
        ref: { type: 'string' },
        message: { type: 'string' },
        sha: { type: 'string' },
      },
    },
  },
  {
    name: 'list_workspaces',
    description: 'List personal plus shared workspace memberships.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'invite_member',
    description: 'Owner only: invite by email or uid with editor or viewer role.',
    inputSchema: {
      type: 'object',
      required: ['workspaceId', 'emailOrUid', 'role'],
      properties: {
        workspaceId: { type: 'string' },
        emailOrUid: { type: 'string' },
        role: { type: 'string' },
      },
    },
  },
  {
    name: 'list_versions',
    description: 'List versions newest-first.',
    inputSchema: {
      type: 'object',
      required: ['workspaceId', 'fileId'],
      properties: { workspaceId: { type: 'string' }, fileId: { type: 'string' } },
    },
  },
  {
    name: 'restore_version',
    description: 'Restore a version as editor/owner. Viewers are denied.',
    inputSchema: {
      type: 'object',
      required: ['workspaceId', 'fileId', 'versionId'],
      properties: {
        workspaceId: { type: 'string' },
        fileId: { type: 'string' },
        versionId: { type: 'string' },
      },
    },
  },
  {
    name: 'sync_wiki',
    description: 'Pull, push, or two-way Confluence/Notion sync. Viewers denied.',
    inputSchema: {
      type: 'object',
      required: ['workspaceId', 'direction', 'connector'],
      properties: {
        workspaceId: { type: 'string' },
        fileId: { type: 'string' },
        direction: { type: 'string' },
        connector: { type: 'string' },
      },
    },
  },
  {
    name: 'activity_query',
    description: 'Owner-only workspace activity query.',
    inputSchema: {
      type: 'object',
      required: ['workspaceId'],
      properties: {
        workspaceId: { type: 'string' },
        actorId: { type: 'string' },
        action: { type: 'string' },
      },
    },
  },
];

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { uid: string; githubToken?: string; firestore: FirestorePort; github: GithubPort; phase2?: Phase2Port },
): Promise<ToolResult> {
  switch (name) {
    case 'list_tree': {
      const [folders, files] = await Promise.all([
        ctx.firestore.listFolders(ctx.uid),
        ctx.firestore.listFiles(ctx.uid),
      ]);
      return ok({
        folders: folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId })),
        files: files.map(f => ({ id: f.id, name: f.name, folderId: f.folderId })),
      });
    }
    case 'list_folder': {
      const folderId = (args.folderId as string | undefined) || null;
      const [folders, files] = await Promise.all([
        ctx.firestore.listFolders(ctx.uid),
        ctx.firestore.listFiles(ctx.uid),
      ]);
      const local = files.filter(f => (f.folderId ?? null) === folderId);
      const folder = folderId ? folders.find(f => f.id === folderId) : undefined;
      let linked: Array<{ path: string; sha: string }> = [];
      if (folder?.repoLink && ctx.githubToken) {
        linked = await ctx.github.listMarkdown(
          folder.repoLink.owner,
          folder.repoLink.repo,
          folder.repoLink.ref,
          folder.repoLink.pathPrefix,
        );
      }
      return ok({ local, linked });
    }
    case 'read_file': {
      if (args.fileId) {
        const file = await ctx.firestore.getFile(ctx.uid, String(args.fileId));
        if (!file) return err('File not found');
        return ok(file);
      }
      if (args.owner && args.repo && args.path && args.ref) {
        try {
          const path = assertSafePath(String(args.path));
          const data = await ctx.github.getFile(String(args.owner), String(args.repo), path, String(args.ref));
          return ok(data);
        } catch (e) {
          return err(e instanceof Error ? e.message : 'Read failed');
        }
      }
      return err('Provide fileId or owner/repo/path/ref');
    }
    case 'write_file': {
      const now = Date.now();
      const workspaceId = args.workspaceId ? String(args.workspaceId) : '';
      if (workspaceId && ctx.phase2) {
        const role = await ctx.phase2.getRole(ctx.uid, workspaceId);
        if (role === 'viewer' || !role) return err('Write denied for this shared workspace role.');
        const existing = args.fileId ? await ctx.firestore.getFile(ctx.uid, String(args.fileId)) : null;
        const file: WorkspaceFileDoc = {
          id: existing?.id || String(args.fileId || crypto.randomUUID()),
          name: String(args.name),
          content: String(args.content),
          folderId: (args.folderId as string | null | undefined) ?? existing?.folderId ?? null,
          origin: existing?.origin ?? { kind: 'local' as const },
          updatedAt: now,
          createdAt: existing?.createdAt ?? now,
        };
        const written = await ctx.phase2.writeSharedFile(ctx.uid, workspaceId, file);
        if (!written.ok) return err(written.error || 'Shared write failed');
        await ctx.phase2.recordActivity({
          workspaceId, actorId: ctx.uid, action: 'mcp_write', fileId: file.id, source: 'mcp',
        });
        return ok({ id: file.id, committed: false, source: 'mcp' });
      }
      const existing = args.fileId ? await ctx.firestore.getFile(ctx.uid, String(args.fileId)) : null;
      const origin = existing?.origin ?? { kind: 'local' as const };
      const file: WorkspaceFileDoc = {
        id: existing?.id || String(args.fileId || crypto.randomUUID()),
        name: String(args.name),
        content: String(args.content),
        folderId: (args.folderId as string | null | undefined) ?? existing?.folderId ?? null,
        origin,
        updatedAt: now,
        createdAt: existing?.createdAt ?? now,
      };
      await ctx.firestore.writeFile(ctx.uid, file);
      return ok({
        id: file.id,
        overlay: origin.kind === 'github',
        committed: false,
        hint: origin.kind === 'github' ? 'Local overlay only. Call save_to_connector to persist to GitHub.' : undefined,
      });
    }
    case 'list_connectors': {
      return ok([
        { id: 'github', displayName: 'GitHub', available: !!ctx.githubToken },
        { id: 'drive', displayName: 'Google Drive', available: false, stub: true },
        { id: 'confluence', displayName: 'Confluence Cloud', available: !!process.env.CONFLUENCE_TOKEN },
        { id: 'notion', displayName: 'Notion', available: !!process.env.NOTION_TOKEN },
      ]);
    }
    case 'save_to_connector': {
      const connector = String(args.connector || '');
      if (connector === 'drive') {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, code: 'NOT_IMPLEMENTED', error: 'Google Drive is not implemented in Phase 1.' }) }],
          isError: true,
        };
      }
      if (connector === 'confluence' || connector === 'notion') {
        if (!ctx.phase2) return err('Wiki sync is unavailable');
        const result = await ctx.phase2.syncWiki(ctx.uid, { ...args, connector });
        if (!result.ok) return err(result.error || 'Wiki sync failed');
        return ok(result);
      }
      if (connector !== 'github') return err('Unknown connector');
      if (!ctx.githubToken) return err('GITHUB_TOKEN is required to save to GitHub.');
      let owner = args.owner as string | undefined;
      let repo = args.repo as string | undefined;
      let path = args.path as string | undefined;
      let ref = args.ref as string | undefined;
      let sha = args.sha as string | undefined;
      let content = args.content as string | undefined;
      if (args.fileId) {
        const file = await ctx.firestore.getFile(ctx.uid, String(args.fileId));
        if (!file) return err('File not found');
        content = content ?? file.content;
        if (file.origin.kind === 'github') {
          owner = owner ?? file.origin.owner;
          repo = repo ?? file.origin.repo;
          path = path ?? file.origin.path;
          ref = ref ?? file.origin.ref;
          sha = sha ?? file.origin.sha;
        }
      }
      if (!owner || !repo || !path || !ref || content == null) {
        return err('GitHub save requires owner, repo, path, ref, and content.');
      }
      try {
        const safe = assertSafePath(path);
        const result = await ctx.github.putFile({
          owner,
          repo,
          path: safe,
          content,
          message: String(args.message || `Update ${safe}`),
          branch: ref,
          sha,
        });
        return ok({ ok: true, sha: result.sha });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'GitHub save failed');
      }
    }
    case 'list_workspaces': {
      if (!ctx.phase2) return err('Shared workspaces unavailable');
      const list = await ctx.phase2.listWorkspaces(ctx.uid);
      return ok({ personal: true, shared: list });
    }
    case 'invite_member': {
      if (!ctx.phase2) return err('Shared workspaces unavailable');
      const workspaceId = String(args.workspaceId);
      const result = await ctx.phase2.inviteMember(ctx.uid, workspaceId, String(args.emailOrUid), String(args.role));
      if (!result.ok) return err(result.error || 'Invite failed');
      return ok(result);
    }
    case 'list_versions': {
      if (!ctx.phase2) return err('Versions unavailable');
      const role = await ctx.phase2.getRole(ctx.uid, String(args.workspaceId));
      if (!role) return err('Not a member');
      const versions = await ctx.phase2.listVersions(String(args.workspaceId), String(args.fileId));
      return ok(versions);
    }
    case 'restore_version': {
      if (!ctx.phase2) return err('Versions unavailable');
      const result = await ctx.phase2.restoreVersion(ctx.uid, String(args.workspaceId), String(args.fileId), String(args.versionId));
      if (!result.ok) return err(result.error || 'Restore denied');
      return ok(result);
    }
    case 'sync_wiki': {
      if (!ctx.phase2) return err('Wiki sync unavailable');
      const result = await ctx.phase2.syncWiki(ctx.uid, args);
      if (!result.ok) return err(result.error || 'Sync denied');
      return ok(result);
    }
    case 'activity_query': {
      if (!ctx.phase2) return err('Activity unavailable');
      const result = await ctx.phase2.queryActivity(ctx.uid, String(args.workspaceId), args);
      if (!result.ok) return err(result.error || 'Owner-only report');
      return ok(result.events || []);
    }
    default:
      return err(`Unknown tool: ${name}`);
  }
}
