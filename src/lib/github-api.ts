import { assertSafePath, isMarkdownPath, normalizePathPrefix } from './workspace';
import { getGithubToken, redactSecrets } from './github-token';

export interface GithubMdFile {
  path: string;
  sha: string;
}

export interface GithubFileContent {
  content: string;
  sha: string;
  path: string;
}

function apiError(status: number, fallback: string): { code: string; error: string } {
  if (status === 401) return { code: 'AUTH', error: 'GitHub authentication failed. Reconnect GitHub or paste a PAT in Settings.' };
  if (status === 403) return { code: 'FORBIDDEN', error: 'GitHub denied access. Enable write scope or check repository permissions.' };
  if (status === 404) return { code: 'NOT_FOUND', error: 'Repository or path was not found. The stored link was kept.' };
  if (status === 409) return { code: 'CONFLICT', error: 'GitHub reported a conflict (SHA mismatch). Refresh then retry save.' };
  return { code: 'HTTP', error: fallback };
}

async function ghFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getGithubToken();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(`https://api.github.com${path}`, { ...init, headers });
  } catch (e) {
    const msg = redactSecrets(e instanceof Error ? e.message : 'Network error');
    throw Object.assign(new Error(msg), { code: 'NETWORK' });
  }
}

export async function resolveDefaultBranch(owner: string, repo: string): Promise<string> {
  const res = await ghFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (!res.ok) {
    const mapped = apiError(res.status, `GitHub error ${res.status}`);
    throw Object.assign(new Error(mapped.error), { code: mapped.code, status: res.status });
  }
  const data = await res.json() as { default_branch?: string };
  return data.default_branch || 'main';
}

export async function listMarkdownFiles(
  owner: string,
  repo: string,
  ref: string | undefined,
  pathPrefix: string | undefined,
): Promise<GithubMdFile[]> {
  const branch = ref || await resolveDefaultBranch(owner, repo);
  const prefix = pathPrefix ? normalizePathPrefix(pathPrefix) : '';
  const res = await ghFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (!res.ok) {
    const mapped = apiError(res.status, `Failed to list tree (${res.status})`);
    throw Object.assign(new Error(mapped.error), { code: mapped.code, status: res.status });
  }
  const data = await res.json() as { tree?: Array<{ path: string; sha: string; type: string }> };
  const files: GithubMdFile[] = [];
  for (const node of data.tree ?? []) {
    if (node.type !== 'blob') continue;
    if (!isMarkdownPath(node.path)) continue;
    if (prefix && node.path !== prefix && !node.path.startsWith(prefix + '/')) continue;
    files.push({ path: node.path, sha: node.sha });
  }
  return files;
}

export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<GithubFileContent> {
  const safe = assertSafePath(path);
  const url = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${safe.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`;
  const res = await ghFetch(url);
  if (!res.ok) {
    const mapped = apiError(res.status, `Failed to read file (${res.status})`);
    throw Object.assign(new Error(mapped.error), { code: mapped.code, status: res.status });
  }
  const data = await res.json() as { content?: string; encoding?: string; sha: string; path: string };
  let content = data.content ?? '';
  if (data.encoding === 'base64') {
    content = decodeBase64(content.replace(/\n/g, ''));
  }
  return { content, sha: data.sha, path: data.path };
}

export async function putFileContent(input: {
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
  branch: string;
  sha?: string;
}): Promise<{ sha: string }> {
  const token = getGithubToken();
  if (!token) {
    throw Object.assign(new Error('GitHub write requires OAuth with repo scope or a PAT in Settings.'), { code: 'AUTH' });
  }
  const safe = assertSafePath(input.path);
  const body: Record<string, string> = {
    message: input.message,
    content: btoaUtf8(input.content),
    branch: input.branch,
  };
  if (input.sha) body.sha = input.sha;
  const res = await ghFetch(
    `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${safe.split('/').map(encodeURIComponent).join('/')}`,
    { method: 'PUT', body: JSON.stringify(body) },
  );
  if (!res.ok) {
    const mapped = apiError(res.status, `Failed to save file (${res.status})`);
    throw Object.assign(new Error(mapped.error), { code: mapped.code, status: res.status });
  }
  const data = await res.json() as { content?: { sha?: string }; commit?: { sha?: string } };
  const sha = data.content?.sha || data.commit?.sha || '';
  return { sha };
}

function decodeBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function btoaUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}
