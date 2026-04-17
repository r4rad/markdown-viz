import {
  doc,
  setDoc,
  getDoc,
  type Firestore,
} from 'firebase/firestore';
import { isFirebaseConfigured } from './firebase-config';
import { getCurrentUser } from './auth';
import { getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import type { FileTab } from '../types';

export function isSharingEnabled(): boolean {
  const val = import.meta.env.VITE_ENABLE_SHARING;
  if (val === undefined || val === '' || val === 'true') return true;
  return false;
}

export function getShareIdFromURL(url: string): string | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/^\/shared\/([^/]+)\/?$/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

export function buildShareURL(docId: string): string {
  return `${window.location.origin}/shared/${docId}`;
}

function getDb(): Firestore | null {
  if (!isFirebaseConfigured()) return null;
  try {
    return getFirestore(getApp());
  } catch {
    return null;
  }
}

export interface SharedDocument {
  name: string;
  content: string;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
}

export async function shareDocument(tab: FileTab): Promise<string | null> {
  const db = getDb();
  const user = getCurrentUser();
  if (!db || !user) return null;

  try {
    const docId = tab.id;
    const sharedRef = doc(db, 'sharedDocs', docId);

    const data: SharedDocument = {
      name: tab.name,
      content: tab.content,
      ownerId: user.uid,
      createdAt: tab.createdAt,
      updatedAt: Date.now(),
    };

    await setDoc(sharedRef, data);
    return docId;
  } catch (e) {
    console.error('Share failed:', e);
    return null;
  }
}

export async function loadSharedDocument(docId: string): Promise<SharedDocument | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const sharedRef = doc(db, 'sharedDocs', docId);
    const snap = await getDoc(sharedRef);
    if (!snap.exists()) return null;

    const d = snap.data() as SharedDocument;
    return {
      name: d.name || 'Shared Document.md',
      content: d.content || '',
      ownerId: d.ownerId || '',
      createdAt: d.createdAt || Date.now(),
      updatedAt: d.updatedAt || Date.now(),
    };
  } catch (e) {
    console.error('Load shared document failed:', e);
    return null;
  }
}

export async function triggerSystemShare(url: string, title: string): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
    }
  }
  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
