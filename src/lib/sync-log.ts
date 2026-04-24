import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { isFirebaseConfigured } from './firebase-config';
import type { SyncLogEntry } from '../types';

// ─── Factory ───

export function buildSyncEntry(params: {
  docId: string;
  userId: string;
  userEmail: string | null;
  displayName: string | null;
  checksum: string;
  deltaBytes: number;
  source: 'personal' | 'collaborative';
}): SyncLogEntry {
  return {
    docId: params.docId,
    userId: params.userId,
    userEmail: params.userEmail,
    displayName: params.displayName,
    checksum: params.checksum,
    deltaBytes: params.deltaBytes,
    source: params.source,
    syncedAt: Date.now(),
  };
}

// ─── Formatting ───

export function formatSyncTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ─── Persistence ───

function getDb() {
  if (!isFirebaseConfigured()) return null;
  try { return getFirestore(getApp()); } catch { return null; }
}

/**
 * Write a sync audit log entry.
 * - personal  → /users/{userId}/syncLog/{logId}
 * - collaborative → /collaborativeDocs/{docId}/syncLog/{logId}
 */
export async function writeSyncLog(entry: SyncLogEntry): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    const path = entry.source === 'collaborative'
      ? ['collaborativeDocs', entry.docId, 'syncLog']
      : ['users', entry.userId, 'syncLog'];

    const ref = collection(db, ...path as [string, string, string]);
    await addDoc(ref, {
      docId: entry.docId,
      userId: entry.userId,
      userEmail: entry.userEmail,
      displayName: entry.displayName,
      checksum: entry.checksum,
      deltaBytes: entry.deltaBytes,
      source: entry.source,
      syncedAt: entry.syncedAt,
    });
  } catch (e) {
    console.error('[sync-log] write failed:', e);
  }
}

/**
 * Retrieve sync log entries ordered by syncedAt.
 */
export async function getSyncLog(params: {
  docId: string;
  source: 'personal' | 'collaborative';
  userId: string;
}): Promise<SyncLogEntry[]> {
  const db = getDb();
  if (!db) return [];

  try {
    const path = params.source === 'collaborative'
      ? ['collaborativeDocs', params.docId, 'syncLog']
      : ['users', params.userId, 'syncLog'];

    const ref = collection(db, ...path as [string, string, string]);
    const q = query(ref, orderBy('syncedAt'));
    const snap = await getDocs(q);

    return snap.docs.map((d) => {
      const data = d.data() as SyncLogEntry;
      return { ...data, id: d.id };
    });
  } catch (e) {
    console.error('[sync-log] read failed:', e);
    return [];
  }
}
