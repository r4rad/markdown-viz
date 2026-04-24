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
}

// ─── Theme types ───
export interface ThemeDefinition {
  id: string;
  name: string;
  type: 'light' | 'dark';
  colors: Record<string, string>;
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
}

// ─── Auth ───
export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  provider: 'github' | 'google';
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
