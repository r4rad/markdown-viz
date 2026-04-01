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

// ─── Events ───
export type EventCallback<T = unknown> = (data: T) => void;
