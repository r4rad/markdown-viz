/** Repository link metadata (no App credentials). Matches domain RepositoryLink. */
export type RepositoryLink = {
  id: string;
  workspaceId: string;
  installationId: number;
  owner: string;
  repo: string;
  syncBranch: string;
  pathPrefix: string;
};

export type LinkInstallationBody = {
  workspaceId: string;
  installationId: number;
  owner: string;
  repo: string;
  syncBranch: string;
  pathPrefix?: string;
};
