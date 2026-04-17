import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  onAuthStateChanged,
  GithubAuthProvider,
  GoogleAuthProvider,
  type Auth,
  type User,
  type AuthError,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig, { isFirebaseConfigured } from './firebase-config';
import type { UserProfile, FileTab, AppState } from '../types';
import { emit } from './events';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let currentUser: User | null = null;

export function initFirebase(): void {
  if (!isFirebaseConfigured()) return;
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    onAuthStateChanged(auth, (user) => {
      currentUser = user;
      if (user) {
        const profile: UserProfile = {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          provider: user.providerData[0]?.providerId?.includes('github') ? 'github' : 'google',
        };
        emit('auth-changed', profile);
      } else {
        emit('auth-changed', null);
      }
    });

    // Handle redirect results (for mobile fallback)
    getRedirectResult(auth).catch((e) => {
      if (e && (e as AuthError).code !== 'auth/no-redirect-result') {
        console.warn('Redirect auth result error:', e);
      }
    });
  } catch (e) {
    console.error('Firebase init failed:', e);
    throw e;
  }
}

async function signInWithProvider(provider: GithubAuthProvider | GoogleAuthProvider): Promise<void> {
  if (!auth) return;
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const err = e as AuthError;
    // Fallback to redirect if popup is blocked or unavailable
    if (err.code === 'auth/popup-blocked' ||
        err.code === 'auth/popup-closed-by-user' ||
        err.code === 'auth/cancelled-popup-request') {
      console.info('Popup blocked, falling back to redirect auth');
      await signInWithRedirect(auth!, provider);
      return;
    }
    // Ignore user-initiated cancellations
    if (err.code === 'auth/user-cancelled') return;
    console.error('Sign-in failed:', err.code, err.message);
    throw e;
  }
}

export async function signInWithGitHub(): Promise<void> {
  const provider = new GithubAuthProvider();
  provider.addScope('read:user');
  await signInWithProvider(provider);
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  await signInWithProvider(provider);
}

export async function signOut(): Promise<void> {
  if (!auth) return;
  await fbSignOut(auth);
}

export function isAuthenticated(): boolean {
  return !!currentUser;
}

export function getCurrentUser(): User | null {
  return currentUser;
}

export function isFirebaseReady(): boolean {
  return isFirebaseConfigured() && !!auth;
}

// ─── Cloud Sync ───

export function getMaxSyncTabs(): number {
  const fromEnv = Number(import.meta.env.VITE_MAX_SYNC_TABS);
  return (Number.isFinite(fromEnv) && fromEnv > 0) ? fromEnv : 10;
}

export async function syncToCloud(state: AppState): Promise<boolean> {
  if (!db || !currentUser) return false;
  const MAX_SYNC_TABS = getMaxSyncTabs();
  try {
    const userRef = doc(db, 'users', currentUser.uid);
    await setDoc(userRef, {
      theme: state.theme,
      syncScroll: state.syncScroll,
      updatedAt: Date.now(),
    }, { merge: true });

    // Sync only the most recently updated tabs (up to limit)
    const sortedTabs = [...state.tabs]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, MAX_SYNC_TABS);

    const filesRef = collection(db, 'users', currentUser.uid, 'files');

    // Remove old cloud files not in synced set
    const existingSnap = await getDocs(filesRef);
    const syncIds = new Set(sortedTabs.map(t => t.id));
    for (const d of existingSnap.docs) {
      if (!syncIds.has(d.id)) {
        await deleteDoc(d.ref);
      }
    }

    for (const tab of sortedTabs) {
      await setDoc(doc(filesRef, tab.id), {
        name: tab.name,
        content: tab.content,
        cursorPos: tab.cursorPos,
        scrollTop: tab.scrollTop,
        scrollPreview: tab.scrollPreview,
        updatedAt: tab.updatedAt,
        createdAt: tab.createdAt,
      });
    }

    if (state.tabs.length > MAX_SYNC_TABS) {
      console.info(`Cloud sync: synced ${MAX_SYNC_TABS} of ${state.tabs.length} tabs (most recent).`);
    }
    return true;
  } catch (e) {
    console.error('Cloud sync failed:', e);
    return false;
  }
}

export async function updateCloudFileName(tabId: string, newName: string): Promise<void> {
  if (!db || !currentUser) return;
  try {
    const fileRef = doc(db, 'users', currentUser.uid, 'files', tabId);
    const snap = await getDoc(fileRef);
    if (snap.exists()) {
      await setDoc(fileRef, { name: newName, updatedAt: Date.now() }, { merge: true });
    }
  } catch (e) {
    console.error('Cloud rename failed:', e);
  }
}

export async function loadFromCloud(): Promise<Partial<AppState> | null> {
  if (!db || !currentUser) return null;
  try {
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? userSnap.data() : {};

    const filesRef = collection(db, 'users', currentUser.uid, 'files');
    const filesSnap = await getDocs(filesRef);
    const tabs: FileTab[] = [];
    filesSnap.forEach((doc) => {
      const d = doc.data();
      tabs.push({
        id: doc.id,
        name: d.name || 'Untitled.md',
        content: d.content || '',
        cursorPos: d.cursorPos || 0,
        scrollTop: d.scrollTop || 0,
        scrollPreview: d.scrollPreview || 0,
        dirty: false,
        updatedAt: d.updatedAt || Date.now(),
        createdAt: d.createdAt || Date.now(),
      });
    });

    return {
      tabs: tabs.length > 0 ? tabs : undefined,
      activeTabId: tabs[0]?.id,
      theme: userData.theme,
      syncScroll: userData.syncScroll,
    };
  } catch (e) {
    console.error('Cloud load failed:', e);
    return null;
  }
}

export async function deleteCloudFile(fileId: string): Promise<void> {
  if (!db || !currentUser) return;
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'files', fileId));
  } catch (e) {
    console.error('Cloud delete failed:', e);
  }
}

export async function getCloudFiles(): Promise<{ id: string; name: string; updatedAt: number }[]> {
  if (!db || !currentUser) return [];
  try {
    const filesRef = collection(db, 'users', currentUser.uid, 'files');
    const snap = await getDocs(filesRef);
    const files: { id: string; name: string; updatedAt: number }[] = [];
    snap.forEach((d) => {
      const data = d.data();
      files.push({
        id: d.id,
        name: data.name || 'Untitled.md',
        updatedAt: data.updatedAt || 0,
      });
    });
    return files;
  } catch (e) {
    console.error('Cloud files list failed:', e);
    return [];
  }
}
