import type { Role, WorkspaceKind } from '@markdown-viz/domain';

export type FolderId = string;
export type FileId = string;

export interface GitHubRepoLink {
  owner: string;
  repo: string;
  ref?: string;
  pathPrefix?: string;
}

export interface WorkspaceFolder {
  id: FolderId;
  name: string;
  parentId: FolderId | null;
  createdAt: number;
  updatedAt: number;
  repoLink?: GitHubRepoLink | null;
}

export type FileOrigin =
  | { kind: 'local' }
  | {
      kind: 'github';
      owner: string;
      repo: string;
      ref: string;
      path: string;
      sha: string;
    };

// ─── Tab / File types ───
export interface FileTab {
  id: string;
  name: string;
  content: string;
  cursorPos: number;
  scrollTop: number;
  scrollPreview: number;
  dirty: boolean;
  updatedAt: number;
  createdAt: number;
  folderId: FolderId | null;
  origin: FileOrigin;
}

// ─── Theme types ───
export interface ThemeDefinition {
  id: string;
  name: string;
  type: 'light' | 'dark';
  colors: Record<string, string>;
}

export type WorkspaceId = string;

/** Domain types live in `@markdown-viz/domain`; re-exported here for SPA imports. */
export type {
  WorkspaceKind,
  Role,
  SyncStatus,
  Organization,
  Workspace,
  Membership,
  Document,
  RepositoryLink,
  SyncJob,
  Conflict,
  HistoryEvent,
  CommentAnchor,
  CommentMessage,
  CommentThread,
} from '@markdown-viz/domain';

export type DocType =
  | 'prd'
  | 'brd'
  | 'task_breakdown'
  | 'architecture'
  | 'meeting_notes'
  | 'content_plan'
  | 'strategy'
  | 'content_calendar'
  | 'note'
  | 'research';

export type TemplatePack = 'engineering' | 'marketing' | 'learner';

export interface TemplateMeta {
  id: string;
  pack: TemplatePack;
  docType: DocType;
  title: string;
  titlePattern: string;
  default?: boolean;
  source: 'builtin' | 'workspace';
}

export interface ParsedTemplate {
  meta: TemplateMeta;
  body: string;
  raw: string;
}

export interface TemplateSettings {
  folderByDocType: Partial<Record<DocType, FolderId>>;
  captureNoteFolderId?: FolderId;
  captureResearchFolderId?: FolderId;
}

// ─── App state ───
export interface AppState {
  tabs: FileTab[];
  activeTabId: string | null;
  theme: string;
  syncScroll: boolean;
  showPreview: boolean;
  showEditor: boolean;
  sidebarOpen: boolean;
  folders: WorkspaceFolder[];
  activeWorkspaceId: string;
  currentRole: Role | null;
  templateSettings: TemplateSettings;
}

export interface SharedWorkspace {
  id: WorkspaceId;
  /** personal | organization | guest — legacy docs without kind normalize to organization. */
  kind: WorkspaceKind;
  name: string;
  orgId?: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceMember {
  uid: string;
  email: string | null;
  role: Role;
  addedAt: number;
}

export interface WorkspaceInvite {
  id: string;
  email: string;
  role: Exclude<Role, 'owner'>;
  createdAt: number;
}

export interface WikiMapping {
  id: string;
  workspaceId: WorkspaceId;
  folderId?: string;
  fileId?: string;
  connector: 'confluence' | 'notion';
  remote: Record<string, string>;
  lastSyncAt?: number;
  lastRemoteChecksum?: string;
  lastLocalChecksum?: string;
}

export type VersionSource = 'save' | 'restore' | 'sync' | 'mcp';

export interface DocVersion {
  id: string;
  fileId: string;
  workspaceId: WorkspaceId | 'personal';
  authorId: string;
  createdAt: number;
  source: VersionSource;
  checksum: string;
  content?: string;
  storagePath?: string;
}

export type ActivityAction = 'edit' | 'restore' | 'sync' | 'mcp_write' | 'invite' | 'role_change' | 'conflict';

export interface ActivityEvent {
  id: string;
  workspaceId: WorkspaceId;
  actorId: string | 'unknown';
  actorEmail: string | null;
  action: ActivityAction;
  fileId?: string;
  createdAt: number;
  checksum?: string;
  meta?: Record<string, string>;
}

// ─── Auth ───
export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  provider: 'github' | 'google';
}

// ─── RTDB presence ───
export interface PresenceRange {
  anchor: number;
  head: number;
}

export interface PresenceUserInput {
  uid: string;
  displayName: string;
  photoURL?: string | null;
}

export interface PresencePeer {
  uid: string;
  displayName: string;
  color: string;
  photoURL: string | null;
  cursor: PresenceRange | null;
  selection: PresenceRange | null;
  updatedAt: number;
}

// ─── Feedback ───
export interface FeedbackData {
  name: string;
  email: string;
  rating: number; // 1-5
  message: string;
  userId?: string | null;
  createdAt: number;
  userAgent: string;
  url: string;
}

// ─── Events ───
export type EventCallback<T = unknown> = (data: T) => void;

// ─── CRDT / Collaborative Editing ───
export interface CollaborativeDocMeta {
  docId: string;
  name: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  checksum: string;         // SHA-256 of current content
  collaborators: string[];  // array of userIds allowed to edit
}

export interface CrdtUpdate {
  update: number[];   // serialized Yjs Uint8Array as number array
  userId: string;
  userEmail: string | null;
  timestamp: number;
  checksum: string;   // SHA-256 of content after this update
  deltaBytes: number; // byte length of the serialized update
}

// ─── Sync Log ───
export interface SyncLogEntry {
  id?: string;
  docId: string;
  userId: string;
  userEmail: string | null;
  displayName: string | null;
  syncedAt: number;
  checksum: string;     // SHA-256 of document content at sync time
  deltaBytes: number;   // bytes changed (update size for CRDT; content diff for personal sync)
  source: 'personal' | 'collaborative';
}

// ─── Audio Cache ───
export const AUDIO_GENERATOR_VERSION = 3;

export interface AudioCache {
  checksum: string;           // SHA-256 of content that generated this script
  script: string;             // pre-processed narration text
  generatedAt: number;
  generatedBy: string;        // userId
  generatorVersion: number;   // bump when generateAudioScript logic changes
  generatorKind: 'extractive' | 'groq'; // source of the script
}
