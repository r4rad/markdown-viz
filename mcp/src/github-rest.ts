import type { GithubPort } from './tools.js';
import { assertSafePath } from '../../src/lib/workspace';

export function createGithubPort(token?: string): GithubPort {
  async function gh(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`https://api.github.com${path}`, { ...init, headers });
  }

  return {
    async getFile(owner, repo, path, ref) {
      const safe = assertSafePath(path);
      const res = await gh(`/repos/${owner}/${repo}/contents/${safe}?ref=${encodeURIComponent(ref)}`);
      if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
      const data = await res.json() as { content?: string; encoding?: string; sha: string };
      let content = data.content ?? '';
      if (data.encoding === 'base64') content = Buffer.from(content, 'base64').toString('utf8');
      return { content, sha: data.sha };
    },
    async listMarkdown(owner, repo, ref, prefix) {
      const branch = ref || 'HEAD';
      const res = await gh(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
      if (!res.ok) throw new Error(`GitHub list failed (${res.status})`);
      const data = await res.json() as { tree?: Array<{ path: string; sha: string; type: string }> };
      return (data.tree ?? [])
        .filter(n => n.type === 'blob' && /\.(md|mdx|markdown)$/i.test(n.path))
        .filter(n => !prefix || n.path === prefix || n.path.startsWith(prefix + '/'))
        .map(n => ({ path: n.path, sha: n.sha }));
    },
    async putFile(input) {
      const safe = assertSafePath(input.path);
      const body: Record<string, string> = {
        message: input.message,
        content: Buffer.from(input.content, 'utf8').toString('base64'),
        branch: input.branch,
      };
      if (input.sha) body.sha = input.sha;
      const res = await gh(`/repos/${input.owner}/${input.repo}/contents/${safe}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`GitHub save failed (${res.status})`);
      const data = await res.json() as { content?: { sha?: string }; commit?: { sha?: string } };
      return { sha: data.content?.sha || data.commit?.sha || '' };
    },
  };
}
