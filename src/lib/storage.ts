import type { AppState, WorkspaceFolder } from '../types';
import { migrateTabs } from './workspace';

const DB_NAME = 'markdownviz';
const DB_VERSION = 2;
const STORE_STATE = 'state';
const STORE_FOLDERS = 'folders';
const STORE_REPO_INDEX = 'repoIndex';
const STATE_KEY = 'app-state';

export interface RepoIndexEntry {
  path: string;
  sha: string;
  fetchedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_STATE)) {
        db.createObjectStore(STORE_STATE);
      }
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_REPO_INDEX)) {
        db.createObjectStore(STORE_REPO_INDEX);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveState(state: AppState): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_STATE, STORE_FOLDERS], 'readwrite');
    tx.objectStore(STORE_STATE).put(JSON.parse(JSON.stringify(state)), STATE_KEY);
    const folderStore = tx.objectStore(STORE_FOLDERS);
    folderStore.clear();
    for (const folder of state.folders) {
      folderStore.put(JSON.parse(JSON.stringify(folder)));
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('Failed to save state:', e);
  }
}

export async function loadState(): Promise<Partial<AppState> | null> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_STATE, STORE_FOLDERS], 'readonly');
    const req = tx.objectStore(STORE_STATE).get(STATE_KEY);
    const result = await new Promise<Partial<AppState> | null>((res, rej) => {
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => rej(req.error);
    });
    const folderReq = tx.objectStore(STORE_FOLDERS).getAll();
    const folders = await new Promise<WorkspaceFolder[]>((res, rej) => {
      folderReq.onsuccess = () => res((folderReq.result as WorkspaceFolder[]) ?? []);
      folderReq.onerror = () => rej(folderReq.error);
    });
    db.close();
    if (!result && folders.length === 0) return null;
    const merged: Partial<AppState> = { ...(result ?? {}) };
    if (merged.tabs?.length) merged.tabs = migrateTabs(merged.tabs);
    if (!merged.folders?.length && folders.length) merged.folders = folders;
    if (merged.folders) merged.folders = merged.folders;
    return merged;
  } catch (e) {
    console.warn('Failed to load state:', e);
    return null;
  }
}

export function repoIndexKey(owner: string, repo: string, ref: string, prefix: string): string {
  return `${owner}/${repo}/${ref}/${prefix}`;
}

export async function saveRepoIndex(key: string, entries: RepoIndexEntry[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_REPO_INDEX, 'readwrite');
    tx.objectStore(STORE_REPO_INDEX).put(entries, key);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('Failed to save repo index:', e);
  }
}

export async function loadRepoIndex(key: string): Promise<RepoIndexEntry[] | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_REPO_INDEX, 'readonly');
    const req = tx.objectStore(STORE_REPO_INDEX).get(key);
    const result = await new Promise<RepoIndexEntry[] | null>((res, rej) => {
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return result;
  } catch (e) {
    console.warn('Failed to load repo index:', e);
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function debouncedSave(state: AppState, delay = 500): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState(state), delay);
}
