import type { Connector, ConnectorExportResult } from './types';
import { getGithubToken } from '../github-token';
import { putFileContent, resolveDefaultBranch } from '../github-api';
import { redactSecrets } from '../github-token';

export const githubConnector: Connector = {
  id: 'github',
  displayName: 'GitHub',
  isAvailable() {
    return !!getGithubToken();
  },
  listCapabilities() {
    return ['export', 'import', 'list'];
  },
  async exportFile(input): Promise<ConnectorExportResult> {
    try {
      const fromOrigin = input.origin?.kind === 'github' ? input.origin : null;
      const owner = input.target?.owner || fromOrigin?.owner;
      const repo = input.target?.repo || fromOrigin?.repo;
      const ref = input.target?.ref || fromOrigin?.ref;
      const path = input.path || fromOrigin?.path;
      if (!owner || !repo || !path || !ref) {
        return { ok: false, code: 'TARGET_REQUIRED', error: 'GitHub save requires owner, repo, path, and ref.' };
      }
      const branch = ref || await resolveDefaultBranch(owner, repo);
      const sha = fromOrigin?.sha;
      const result = await putFileContent({
        owner,
        repo,
        path,
        content: input.content,
        message: input.message,
        branch,
        sha,
      });
      return { ok: true, sha: result.sha };
    } catch (e) {
      const err = e as Error & { code?: string };
      return {
        ok: false,
        code: err.code || 'GITHUB',
        error: redactSecrets(err.message || 'GitHub save failed'),
      };
    }
  },
};
