import type { AppState } from '../types';

const DB_NAME = 'markdownviz';
const DB_VERSION = 1;
const STORE_NAME = 'state';
const STATE_KEY = 'app-state';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveState(state: AppState): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(JSON.parse(JSON.stringify(state)), STATE_KEY);
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
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(STATE_KEY);
    const result = await new Promise<Partial<AppState> | null>((res, rej) => {
      req.onsuccess = () => res(req.result ?? null);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return result;
  } catch (e) {
    console.warn('Failed to load state:', e);
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function debouncedSave(state: AppState, delay = 500): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState(state), delay);
}
