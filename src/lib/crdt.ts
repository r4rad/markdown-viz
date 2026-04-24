import * as Y from 'yjs';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { isFirebaseConfigured } from './firebase-config';
import type { CrdtUpdate } from '../types';

// ─── Checksum ───

export async function computeChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Binary ↔ Base64 ───

export function uint8ArrayToBase64(arr: Uint8Array): string {
  if (arr.length === 0) return '';
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(b64: string): Uint8Array {
  if (!b64) return new Uint8Array(0);
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

// ─── CrdtUpdate factory ───

export function buildCrdtUpdate(params: {
  update: Uint8Array;
  userId: string;
  userEmail: string | null;
  checksum: string;
  deltaBytes: number;
}): CrdtUpdate {
  return {
    update: Array.from(params.update),
    userId: params.userId,
    userEmail: params.userEmail,
    timestamp: Date.now(),
    checksum: params.checksum,
    deltaBytes: params.deltaBytes,
  };
}

// ─── Collaborative Session ───

export interface CollaborativeSession {
  docId: string;
  getContent: () => string;
  applyRemoteContent: (content: string) => void;
  destroy: () => void;
}

function getDb() {
  if (!isFirebaseConfigured()) return null;
  try { return getFirestore(getApp()); } catch { return null; }
}

export async function initCollaborativeDoc(
  docId: string,
  initialContent: string,
  onContentChange: (content: string) => void,
): Promise<CollaborativeSession> {
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText('content');
  let unsubscribeRemote: Unsubscribe | null = null;
  let isApplyingRemote = false;

  // ── 1. Load existing Yjs snapshot from Firestore (if any) ──
  const db = getDb();
  if (db) {
    const metaRef = doc(db, 'collaborativeDocs', docId);
    const metaSnap = await getDoc(metaRef);
    if (metaSnap.exists()) {
      const data = metaSnap.data();
      if (data?.snapshot) {
        const snapshotBytes = base64ToUint8Array(data.snapshot);
        Y.applyUpdate(ydoc, snapshotBytes);
      }
    }
  }

  // ── 2. If Y.Text is still empty, set the initial content ──
  if (ytext.length === 0 && initialContent) {
    ydoc.transact(() => {
      ytext.insert(0, initialContent);
    }, 'init');
  }

  // Emit initial state
  onContentChange(ytext.toString());

  // ── 3. Watch for local changes ──
  const handleLocalUpdate = async (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote' || isApplyingRemote) return;
    if (!db) return;

    const content = ytext.toString();
    const checksum = await computeChecksum(content);

    // Store incremental update in subcollection
    const updatesRef = collection(db, 'collaborativeDocs', docId, 'updates');
    await addDoc(updatesRef, buildCrdtUpdate({
      update,
      userId: '',       // caller injects via writeSyncLog after
      userEmail: null,
      checksum,
      deltaBytes: update.byteLength,
    }));

    // Update snapshot in parent doc
    const metaRef = doc(db, 'collaborativeDocs', docId);
    const snapshot = uint8ArrayToBase64(Y.encodeStateAsUpdate(ydoc));
    await setDoc(metaRef, { snapshot, checksum, updatedAt: Date.now() }, { merge: true });
  };

  ydoc.on('update', handleLocalUpdate);

  // ── 4. Subscribe to remote updates from Firestore ──
  if (db) {
    const updatesRef = collection(db, 'collaborativeDocs', docId, 'updates');
    const q = query(updatesRef, orderBy('timestamp'));
    unsubscribeRemote = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const data = change.doc.data() as CrdtUpdate;
        const updateBytes = new Uint8Array(data.update);
        isApplyingRemote = true;
        Y.applyUpdate(ydoc, updateBytes, 'remote');
        isApplyingRemote = false;
        onContentChange(ytext.toString());
      });
    });
  }

  return {
    docId,
    getContent: () => ytext.toString(),
    applyRemoteContent: (content: string) => {
      isApplyingRemote = true;
      ydoc.transact(() => {
        ytext.delete(0, ytext.length);
        if (content) ytext.insert(0, content);
      }, 'remote');
      isApplyingRemote = false;
      onContentChange(ytext.toString());
    },
    destroy: () => {
      ydoc.off('update', handleLocalUpdate);
      unsubscribeRemote?.();
      ydoc.destroy();
    },
  };
}

// ─── Active sessions registry ───

const activeSessions = new Map<string, CollaborativeSession>();

export async function startCollaboration(
  docId: string,
  initialContent: string,
  onContentChange: (content: string) => void,
): Promise<CollaborativeSession> {
  if (activeSessions.has(docId)) {
    activeSessions.get(docId)!.destroy();
  }
  const session = await initCollaborativeDoc(docId, initialContent, onContentChange);
  activeSessions.set(docId, session);
  return session;
}

export function stopCollaboration(docId: string): void {
  const session = activeSessions.get(docId);
  if (session) {
    session.destroy();
    activeSessions.delete(docId);
  }
}

export function getActiveSession(docId: string): CollaborativeSession | undefined {
  return activeSessions.get(docId);
}
