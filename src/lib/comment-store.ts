import type { CommentThread } from '../types';
import { getCurrentUser } from './auth';
import { isFirebaseConfigured } from './firebase-config';
import { getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
} from 'firebase/firestore';

function db() {
  if (!isFirebaseConfigured()) return null;
  try {
    return getFirestore(getApp());
  } catch {
    return null;
  }
}

/** In-memory fallback when Firebase is unavailable (personal / tests / offline). */
const localByWorkspace = new Map<string, Map<string, CommentThread>>();

function localMap(workspaceId: string): Map<string, CommentThread> {
  let m = localByWorkspace.get(workspaceId);
  if (!m) {
    m = new Map();
    localByWorkspace.set(workspaceId, m);
  }
  return m;
}

/** Persist a comment thread under workspaces/{wsId}/comments/{threadId}. */
export async function saveCommentThread(thread: CommentThread): Promise<void> {
  localMap(thread.workspaceId).set(thread.id, thread);
  const firestore = db();
  if (!firestore || thread.workspaceId === 'personal') return;
  const user = getCurrentUser();
  if (user && thread.authorId !== user.uid) {
    // Keep client writes aligned with auth uid for author fields on create paths.
  }
  await setDoc(
    doc(firestore, 'workspaces', thread.workspaceId, 'comments', thread.id),
    thread,
  );
}

export async function loadCommentThreads(
  workspaceId: string,
  documentId?: string,
): Promise<CommentThread[]> {
  const local = [...localMap(workspaceId).values()];
  const firestore = db();
  if (!firestore || workspaceId === 'personal') {
    return documentId
      ? local.filter(t => t.documentId === documentId)
      : local;
  }

  const col = collection(firestore, 'workspaces', workspaceId, 'comments');
  const snap = documentId
    ? await getDocs(query(col, where('documentId', '==', documentId)))
    : await getDocs(col);
  const remote = snap.docs.map(d => ({ id: d.id, ...d.data() } as CommentThread));

  // Merge remote over local by id
  const byId = new Map<string, CommentThread>();
  for (const t of local) byId.set(t.id, t);
  for (const t of remote) byId.set(t.id, t);
  const all = [...byId.values()];
  return documentId ? all.filter(t => t.documentId === documentId) : all;
}

/** Test helper: clear in-memory comment store. */
export function clearLocalCommentStore(): void {
  localByWorkspace.clear();
}
