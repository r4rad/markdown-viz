import { getGithubAppConfig, hasGithubAppCredentials } from '../github/config.js';
import type { RepositoryLink } from '../github/types.js';
import type { SyncCommitResult, SyncJob } from './types.js';
import { transientError } from './types.js';

/**
 * Commit document content to the linked repo via GitHub App installation token.
 * Production uses App JWT → installation access token → Contents/Git API.
 * Local/CI uses an injectable stub that never talks to GitHub.
 */
export interface GithubSyncCommitter {
  commit(job: SyncJob, link: RepositoryLink): Promise<SyncCommitResult>;
}

export type StubCommitterOptions = {
  /** Fail the next N attempts with a transient error (Cloud Tasks retry). */
  failTransientTimes?: number;
  /** Force permanent failure. */
  failPermanent?: boolean;
};

export function createStubGithubSyncCommitter(
  options: StubCommitterOptions = {},
): GithubSyncCommitter & { commits: Array<{ jobId: string; sha: string }> } {
  let remainingTransient = options.failTransientTimes ?? 0;
  const commits: Array<{ jobId: string; sha: string }> = [];

  return {
    commits,
    async commit(job, link) {
      // Touch App config so VITE_* secret misconfig fails closed.
      const cfg = getGithubAppConfig();
      if (options.failPermanent) {
        throw new Error('github_commit_permanent_failure');
      }
      if (remainingTransient > 0) {
        remainingTransient -= 1;
        throw transientError('github_commit_transient_failure');
      }
      const sha = `stub-${job.id}-${commits.length + 1}`;
      commits.push({ jobId: job.id, sha });
      // Credentials may be empty in local stub; hasGithubAppCredentials is informational.
      void hasGithubAppCredentials(cfg);
      void link;
      return { sha };
    },
  };
}

let defaultCommitter: GithubSyncCommitter = createStubGithubSyncCommitter();

export function getGithubSyncCommitter(): GithubSyncCommitter {
  return defaultCommitter;
}

export function setGithubSyncCommitter(committer: GithubSyncCommitter): void {
  defaultCommitter = committer;
}

export function resetGithubSyncCommitter(): GithubSyncCommitter {
  defaultCommitter = createStubGithubSyncCommitter();
  return defaultCommitter;
}
