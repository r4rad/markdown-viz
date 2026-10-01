import type { DocVersion, FileOrigin, FileTab, GitHubRepoLink, WorkspaceFolder } from '../types';

/** Newest-first (stable for equal timestamps). */
export function sortHistoryNewestFirst(versions: DocVersion[]): DocVersion[] {
  return [...versions].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

export function resolveRepoLink(
  tab: Pick<FileTab, 'origin' | 'folderId'> | null,
  folders: WorkspaceFolder[],
): GitHubRepoLink | null {
  if (!tab) return null;
  if (tab.origin?.kind === 'github') {
    return { owner: tab.origin.owner, repo: tab.origin.repo, ref: tab.origin.ref };
  }
  if (!tab.folderId) return null;
  const folder = folders.find(f => f.id === tab.folderId);
  return folder?.repoLink ?? null;
}

/** Public GitHub commit URL when repo context and SHA are known. */
export function gitCommitUrl(
  gitSha: string | undefined,
  repo: GitHubRepoLink | null,
): string | null {
  if (!gitSha?.trim() || !repo?.owner || !repo?.repo) return null;
  return `https://github.com/${repo.owner}/${repo.repo}/commit/${gitSha.trim()}`;
}

export function formatHistoryTime(createdAt: number): string {
  try {
    return new Date(createdAt).toLocaleString();
  } catch {
    return String(createdAt);
  }
}

export function shortAuthor(authorId: string): string {
  if (!authorId) return 'unknown';
  if (authorId.includes('@')) return authorId;
  return authorId.length > 12 ? `${authorId.slice(0, 8)}…` : authorId;
}

export function shortSha(sha: string): string {
  return sha.length > 7 ? sha.slice(0, 7) : sha;
}

/** Prefer version gitSha; fall back to GitHub file origin SHA. */
export function versionGitSha(version: DocVersion, origin?: FileOrigin): string | undefined {
  if (version.gitSha) return version.gitSha;
  if (origin?.kind === 'github' && origin.sha) return origin.sha;
  return undefined;
}
