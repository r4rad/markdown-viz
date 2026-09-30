/** Shared hybrid-workspace domain types (design R2). */

export type WorkspaceKind = 'personal' | 'organization' | 'guest';

export type Role = 'owner' | 'editor' | 'commentator' | 'viewer';

export type SyncStatus = 'InSync' | 'Ahead' | 'Behind' | 'Conflict';

export interface Organization {
  id: string;
  name: string;
  createdAt: number;
}

export interface Workspace {
  id: string;
  kind: WorkspaceKind;
  name: string;
  orgId?: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
}

export interface Membership {
  uid: string;
  email: string | null;
  role: Role;
  addedAt: number;
}

export interface Document {
  id: string;
  workspaceId: string;
  folderId: string | null;
  path: string;
  title: string;
  currentVersionId: string;
  syncStatus: SyncStatus;
  repoLinkId?: string;
  updatedAt: number;
}

export interface RepositoryLink {
  id: string;
  workspaceId: string;
  installationId: number;
  owner: string;
  repo: string;
  syncBranch: string;
  pathPrefix: string;
}

export type SyncJobState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'blocked_conflict';

export interface SyncJob {
  id: string;
  documentId: string;
  workspaceId: string;
  state: SyncJobState;
  quietUntil: number;
  attempt: number;
}

export type ConflictStatus = 'open' | 'resolved';
export type ConflictResolution = 'local' | 'remote' | 'merged';

export interface Conflict {
  id: string;
  documentId: string;
  workspaceId: string;
  baseSha: string;
  localChecksum: string;
  remoteSha: string;
  status: ConflictStatus;
  resolution?: ConflictResolution;
}

export type HistoryEventSource =
  | 'save'
  | 'restore'
  | 'sync'
  | 'conflict'
  | 'git_import'
  | 'mcp';

export interface HistoryEvent {
  id: string;
  documentId: string;
  workspaceId: string;
  authorId: string;
  createdAt: number;
  source: HistoryEventSource;
  checksum: string;
  snapshotPath?: string;
  deltaPath?: string;
  gitSha?: string;
}

/** Yjs relative-position payloads (not raw offsets as sole truth). */
export type CommentAnchor = unknown;

export interface CommentMessage {
  id: string;
  authorId: string;
  authorEmail: string | null;
  body: string;
  createdAt: number;
}

export interface CommentThread {
  id: string;
  documentId: string;
  workspaceId: string;
  /** Yjs relative position payloads (not character offsets alone). */
  anchor: CommentAnchor;
  quote: string;
  resolved: boolean;
  authorId: string;
  authorEmail: string | null;
  createdAt: number;
  updatedAt: number;
  messages: CommentMessage[];
}
