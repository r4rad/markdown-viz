import type { ActivityEvent } from '../types';
import { buildActivityEvent } from './activity';
import { getCurrentUser } from './auth';
import { isFirebaseConfigured } from './firebase-config';
import { getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, setDoc, doc } from 'firebase/firestore';

function db() {
  if (!isFirebaseConfigured()) return null;
  try { return getFirestore(getApp()); } catch { return null; }
}

export async function recordActivity(input: Parameters<typeof buildActivityEvent>[0]): Promise<void> {
  const firestore = db();
  const user = getCurrentUser();
  const event = buildActivityEvent({
    ...input,
    actorId: input.actorId ?? user?.uid ?? 'unknown',
    actorEmail: input.actorEmail ?? user?.email ?? null,
  });
  if (!firestore || event.workspaceId === 'personal') return;
  if (user && event.actorId !== 'unknown' && event.actorId !== user.uid) {
    event.actorId = user.uid;
  }
  await setDoc(doc(firestore, 'workspaces', event.workspaceId, 'activity', event.id), event);
}

export async function loadActivity(workspaceId: string): Promise<ActivityEvent[]> {
  const firestore = db();
  if (!firestore) return [];
  const snap = await getDocs(collection(firestore, 'workspaces', workspaceId, 'activity'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityEvent));
}
