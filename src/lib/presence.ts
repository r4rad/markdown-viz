import { getApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  update,
  remove,
  onDisconnect,
  onValue,
  type Database,
  type Unsubscribe,
} from 'firebase/database';
import { isFirebaseConfigured } from './firebase-config';
import { getCurrentUser } from './auth';
import { getActiveTab, getState } from './state';
import { emit, on } from './events';
import type { PresencePeer, PresenceUserInput } from '../types';

const PRESENCE_COLORS = [
  '#e11d48', '#ea580c', '#ca8a04', '#16a34a',
  '#0891b2', '#2563eb', '#7c3aed', '#db2777',
];

let db: Database | null = null;
let activeDocId: string | null = null;
let activeUid: string | null = null;
let peersUnsub: Unsubscribe | null = null;
let disconnectBound: ReturnType<typeof onDisconnect> | null = null;
let lastPeers: PresencePeer[] = [];
let cursorTimer: ReturnType<typeof setTimeout> | null = null;
let mounted = false;

function getRtdb(): Database | null {
  if (!isFirebaseConfigured()) return null;
  if (db) return db;
  try {
    db = getDatabase(getApp());
    return db;
  } catch {
    return null;
  }
}

/** Stable accent color derived from uid (for cursor + avatar ring). */
export function colorForUid(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash << 5) - hash + uid.charCodeAt(i)) | 0;
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

/** Parse an RTDB presence snapshot value into peers (excluding local uid if given). */
export function parsePresenceSnapshot(
  raw: Record<string, unknown> | null | undefined,
  excludeUid?: string | null,
): PresencePeer[] {
  if (!raw || typeof raw !== 'object') return [];
  const peers: PresencePeer[] = [];
  for (const [uid, value] of Object.entries(raw)) {
    if (!uid || (excludeUid && uid === excludeUid)) continue;
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const displayName = typeof v.displayName === 'string' && v.displayName
      ? v.displayName
      : 'User';
    const color = typeof v.color === 'string' && v.color ? v.color : colorForUid(uid);
    const photoURL = typeof v.photoURL === 'string' ? v.photoURL : null;
    const cursor = normalizeRange(v.cursor);
    const selection = normalizeRange(v.selection) ?? cursor;
    const updatedAt = typeof v.updatedAt === 'number' ? v.updatedAt : Date.now();
    peers.push({ uid, displayName, color, photoURL, cursor, selection, updatedAt });
  }
  return peers.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function normalizeRange(value: unknown): { anchor: number; head: number } | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const anchor = Number(v.anchor);
  const head = Number(v.head);
  if (!Number.isFinite(anchor) || !Number.isFinite(head)) return null;
  return { anchor: Math.max(0, Math.floor(anchor)), head: Math.max(0, Math.floor(head)) };
}

function presencePath(docId: string, uid: string): string {
  return `presence/${docId}/${uid}`;
}

function emitPeers(peers: PresencePeer[]): void {
  lastPeers = peers;
  emit('presence-changed', peers);
}

export function getPresencePeers(): PresencePeer[] {
  return lastPeers;
}

export function getActivePresenceDocId(): string | null {
  return activeDocId;
}

/** Publish presence for a document and subscribe to peers. Clears via onDisconnect(). */
export async function joinPresence(docId: string, user: PresenceUserInput): Promise<boolean> {
  const rtdb = getRtdb();
  if (!rtdb || !docId || !user.uid) return false;

  if (activeDocId === docId && activeUid === user.uid) return true;
  await leavePresence();

  const color = colorForUid(user.uid);
  const payload = {
    displayName: user.displayName || 'User',
    color,
    photoURL: user.photoURL ?? null,
    cursor: null as { anchor: number; head: number } | null,
    selection: null as { anchor: number; head: number } | null,
    updatedAt: Date.now(),
  };

  const userRef = ref(rtdb, presencePath(docId, user.uid));
  try {
    disconnectBound = onDisconnect(userRef);
    await disconnectBound.remove();
    await set(userRef, payload);
  } catch (e) {
    console.warn('Presence join failed:', e);
    disconnectBound = null;
    return false;
  }

  activeDocId = docId;
  activeUid = user.uid;

  const docRef = ref(rtdb, `presence/${docId}`);
  peersUnsub = onValue(docRef, (snap) => {
    const peers = parsePresenceSnapshot(snap.val() as Record<string, unknown> | null, user.uid);
    emitPeers(peers);
  }, (err) => {
    console.warn('Presence listen failed:', err);
  });

  return true;
}

/** Remove local presence and stop listening. */
export async function leavePresence(): Promise<void> {
  if (!activeDocId && !activeUid && !peersUnsub) return;

  if (cursorTimer) {
    clearTimeout(cursorTimer);
    cursorTimer = null;
  }
  peersUnsub?.();
  peersUnsub = null;

  const docId = activeDocId;
  const uid = activeUid;
  const rtdb = getRtdb();

  try {
    if (disconnectBound) {
      await disconnectBound.cancel().catch(() => undefined);
    }
  } catch {
    // ignore
  }
  disconnectBound = null;

  if (rtdb && docId && uid) {
    try {
      await remove(ref(rtdb, presencePath(docId, uid)));
    } catch (e) {
      console.warn('Presence leave failed:', e);
    }
  }

  activeDocId = null;
  activeUid = null;
  emitPeers([]);
}

/**
 * Update local cursor/selection in RTDB (throttled).
 * No-op when not joined.
 */
export function publishLocalCursor(anchor: number, head: number): void {
  if (!activeDocId || !activeUid) return;
  const rtdb = getRtdb();
  if (!rtdb) return;

  if (cursorTimer) clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => {
    cursorTimer = null;
    if (!activeDocId || !activeUid) return;
    const range = {
      anchor: Math.max(0, Math.floor(anchor)),
      head: Math.max(0, Math.floor(head)),
    };
    update(ref(rtdb, presencePath(activeDocId, activeUid)), {
      cursor: range,
      selection: range,
      updatedAt: Date.now(),
    }).catch((e) => console.warn('Presence cursor update failed:', e));
  }, 80);
}

/** Keep RTDB presence aligned with shared-workspace active document. */
export async function syncPresenceForActiveDoc(): Promise<void> {
  const state = getState();
  const user = getCurrentUser();
  const tab = getActiveTab();
  const inShared = state.activeWorkspaceId !== 'personal' && !!state.currentRole;

  if (!user || !tab || !inShared || !isFirebaseConfigured()) {
    await leavePresence();
    return;
  }

  await joinPresence(tab.id, {
    uid: user.uid,
    displayName: user.displayName || user.email || 'User',
    photoURL: user.photoURL,
  });
}

/** Wire presence lifecycle to auth / workspace / tab events (idempotent). */
export function mountPresenceController(): void {
  if (mounted) return;
  mounted = true;
  const sync = () => { void syncPresenceForActiveDoc(); };
  on('active-tab-changed', sync);
  on('state-changed', sync);
  on('auth-changed', sync);
  sync();
}
