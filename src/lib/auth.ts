import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  GithubAuthProvider,
  GoogleAuthProvider,
  type Auth,
  type User,
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
    app = initializeApp(firebaseConfig);
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
  } catch (e) {
    console.warn('Firebase init failed:', e);
  }
}

export async function signInWithGitHub(): Promise<void> {
  if (!auth) return;
  try {
    const provider = new GithubAuthProvider();
    provider.addScope('read:user');
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error('GitHub sign-in failed:', e);
    throw e;
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (!auth) return;
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error('Google sign-in failed:', e);
    throw e;
  }
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

export async function syncToCloud(state: AppState): Promise<void> {
  if (!db || !currentUser) return;
  try {
    const userRef = doc(db, 'users', currentUser.uid);
    await setDoc(userRef, {
      theme: state.theme,
      syncScroll: state.syncScroll,
      updatedAt: Date.now(),
    }, { merge: true });

    const filesRef = collection(db, 'users', currentUser.uid, 'files');
    for (const tab of state.tabs) {
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
  } catch (e) {
    console.error('Cloud sync failed:', e);
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
