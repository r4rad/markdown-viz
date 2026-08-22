import type { FileTab, SharedWorkspace, WorkspaceFolder, WorkspaceInvite, WorkspaceMember } from '../types';
import { isFirebaseConfigured } from './firebase-config';
import { getCurrentUser } from './auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  collectionGroup,
  getDocs,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { emit } from './events';

function db() {
  if (!isFirebaseConfigured()) return null;
  try { return getFirestore(getApp()); } catch { return null; }
}

export function copyTreeToWorkspacePayload(folders: WorkspaceFolder[], tabs: FileTab[]) {
  return {
    folders: folders.map(f => ({ ...f })),
    files: tabs.map(t => ({
      id: t.id,
      name: t.name,
      content: t.content,
      folderId: t.folderId,
      origin: t.origin,
      updatedAt: t.updatedAt,
      createdAt: t.createdAt,
      cursorPos: t.cursorPos,
      scrollTop: t.scrollTop,
      scrollPreview: t.scrollPreview,
    })),
  };
}

export async function createSharedWorkspace(name: string, folders: WorkspaceFolder[], tabs: FileTab[]): Promise<SharedWorkspace | null> {
  const user = getCurrentUser();
  const firestore = db();
  if (!user || !firestore) {
    emit('workspace-error', 'Sign in with Firebase to create a shared workspace.');
    return null;
  }
  const now = Date.now();
  const id = crypto.randomUUID();
  const ws: SharedWorkspace = { id, name: name.trim() || 'Shared workspace', ownerId: user.uid, createdAt: now, updatedAt: now };
  const wsRef = doc(firestore, 'workspaces', id);
  await setDoc(wsRef, ws);
  await setDoc(doc(firestore, 'workspaces', id, 'members', user.uid), {
    uid: user.uid,
    email: user.email,
    role: 'owner',
    addedAt: now,
  });
  await setDoc(doc(firestore, 'users', user.uid, 'memberships', id), {
    workspaceId: id, name: ws.name, role: 'owner',
  });
  const payload = copyTreeToWorkspacePayload(folders, tabs);
  for (const folder of payload.folders) {
    await setDoc(doc(firestore, 'workspaces', id, 'folders', folder.id), folder);
  }
  for (const file of payload.files) {
    await setDoc(doc(firestore, 'workspaces', id, 'files', file.id), file);
  }
  return ws;
}

export async function listMemberships(): Promise<Array<SharedWorkspace & { role: string }>> {
  const user = getCurrentUser();
  const firestore = db();
  if (!user || !firestore) return [];
  const memSnap = await getDocs(collection(firestore, 'users', user.uid, 'memberships'));
  const out: Array<SharedWorkspace & { role: string }> = [];
  for (const m of memSnap.docs) {
    const wsId = m.id;
    const wsDoc = await getDoc(doc(firestore, 'workspaces', wsId));
    if (!wsDoc.exists()) continue;
    const data = wsDoc.data() as SharedWorkspace;
    out.push({ ...data, id: wsId, role: m.data().role });
  }
  return out;
}

export async function loadSharedTree(workspaceId: string): Promise<{ folders: WorkspaceFolder[]; tabs: FileTab[]; role: string } | null> {
  const user = getCurrentUser();
  const firestore = db();
  if (!user || !firestore) return null;
  const member = await getDoc(doc(firestore, 'workspaces', workspaceId, 'members', user.uid));
  if (!member.exists()) return null;
  const foldersSnap = await getDocs(collection(firestore, 'workspaces', workspaceId, 'folders'));
  const filesSnap = await getDocs(collection(firestore, 'workspaces', workspaceId, 'files'));
  const folders: WorkspaceFolder[] = foldersSnap.docs.map(d => ({ id: d.id, ...d.data() } as WorkspaceFolder));
  const tabs: FileTab[] = filesSnap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name,
      content: data.content,
      cursorPos: data.cursorPos || 0,
      scrollTop: data.scrollTop || 0,
      scrollPreview: data.scrollPreview || 0,
      dirty: false,
      updatedAt: data.updatedAt,
      createdAt: data.createdAt,
      folderId: data.folderId ?? null,
      origin: data.origin || { kind: 'local' },
    };
  });
  return { folders, tabs, role: member.data().role };
}

export async function inviteMember(workspaceId: string, emailOrUid: string, role: 'editor' | 'viewer'): Promise<{ pending?: boolean; uid?: string }> {
  const user = getCurrentUser();
  const firestore = db();
  if (!user || !firestore) throw new Error('Firebase required');
  const email = emailOrUid.includes('@') ? emailOrUid.trim().toLowerCase() : '';
  const uid = email ? '' : emailOrUid.trim();
  if (uid) {
    await setDoc(doc(firestore, 'workspaces', workspaceId, 'members', uid), {
      uid, email: null, role, addedAt: Date.now(),
    });
    const ws = await getDoc(doc(firestore, 'workspaces', workspaceId));
    await setDoc(doc(firestore, 'users', uid, 'memberships', workspaceId), {
      workspaceId, name: ws.data()?.name || '', role,
    });
    return { uid };
  }
  const inviteId = crypto.randomUUID();
  await setDoc(doc(firestore, 'workspaces', workspaceId, 'invites', inviteId), {
    email, role, createdAt: Date.now(),
  });
  return { pending: true };
}

export async function changeMemberRole(workspaceId: string, uid: string, role: 'editor' | 'viewer' | 'owner'): Promise<void> {
  const firestore = db();
  if (!firestore) return;
  await setDoc(doc(firestore, 'workspaces', workspaceId, 'members', uid), { role }, { merge: true });
  await setDoc(doc(firestore, 'users', uid, 'memberships', workspaceId), { role }, { merge: true });
}

export async function removeMember(workspaceId: string, uid: string): Promise<void> {
  const firestore = db();
  if (!firestore) return;
  await deleteDoc(doc(firestore, 'workspaces', workspaceId, 'members', uid));
  await deleteDoc(doc(firestore, 'users', uid, 'memberships', workspaceId));
}

export async function deleteSharedWorkspace(workspaceId: string): Promise<void> {
  const firestore = db();
  if (!firestore) return;
  const cols = ['members', 'folders', 'files', 'mappings', 'versions', 'activity', 'invites'] as const;
  for (const col of cols) {
    const snap = await getDocs(collection(firestore, 'workspaces', workspaceId, col));
    for (const d of snap.docs) await deleteDoc(d.ref);
  }
  await deleteDoc(doc(firestore, 'workspaces', workspaceId));
}

export async function listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const firestore = db();
  if (!firestore) return [];
  const snap = await getDocs(collection(firestore, 'workspaces', workspaceId, 'members'));
  return snap.docs.map(d => d.data() as WorkspaceMember);
}

export async function listInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
  const firestore = db();
  if (!firestore) return [];
  const snap = await getDocs(collection(firestore, 'workspaces', workspaceId, 'invites'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkspaceInvite));
}

export async function acceptPendingInvites(): Promise<void> {
  const user = getCurrentUser();
  const firestore = db();
  if (!user?.email || !firestore) return;
  const invites = await getDocs(query(
    collectionGroup(firestore, 'invites'),
    where('email', '==', user.email.toLowerCase()),
  ));
  for (const inv of invites.docs) {
    const data = inv.data();
    const wsId = inv.ref.parent.parent?.id;
    if (!wsId) continue;
    const ws = await getDoc(doc(firestore, 'workspaces', wsId));
    await setDoc(doc(firestore, 'workspaces', wsId, 'members', user.uid), {
      uid: user.uid,
      email: user.email,
      role: data.role,
      addedAt: Date.now(),
    });
    await setDoc(doc(firestore, 'users', user.uid, 'memberships', wsId), {
      workspaceId: wsId, name: ws.data()?.name || '', role: data.role,
    });
    await deleteDoc(inv.ref);
  }
}

export async function syncSharedFile(workspaceId: string, tab: FileTab): Promise<void> {
  const firestore = db();
  if (!firestore) return;
  await setDoc(doc(firestore, 'workspaces', workspaceId, 'files', tab.id), {
    name: tab.name,
    content: tab.content,
    folderId: tab.folderId,
    origin: tab.origin,
    updatedAt: Date.now(),
    createdAt: tab.createdAt,
    cursorPos: tab.cursorPos,
    scrollTop: tab.scrollTop,
    scrollPreview: tab.scrollPreview,
  }, { merge: true });
}

export async function setDocCollaborators(fileId: string, uids: string[], ownerId: string): Promise<void> {
  const firestore = db();
  if (!firestore) return;
  await setDoc(doc(firestore, 'collaborativeDocs', fileId), {
    collaborators: uids,
    ownerId,
    updatedAt: Date.now(),
  }, { merge: true });
}
