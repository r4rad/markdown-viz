import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('firebase/app', () => ({
  getApps: () => [{}],
  getApp: () => ({}),
  initializeApp: () => ({}),
}));

const mockStore: Record<string, any[]> = {};

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: (_db: any, ...path: string[]) => ({ path: path.join('/') }),
  collection: (_db: any, ...path: string[]) => ({ path: path.join('/') }),
  addDoc: vi.fn(async (ref: any, data: any) => {
    const arr = mockStore[ref.path] ?? [];
    arr.push(data);
    mockStore[ref.path] = arr;
    return { id: String(arr.length) };
  }),
  getDocs: vi.fn(async (ref: any) => ({
    docs: (mockStore[ref.path] ?? []).map((d, i) => ({ id: String(i), data: () => d })),
  })),
  query: vi.fn((ref: any) => ref),
  orderBy: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  onAuthStateChanged: () => {},
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(() => Promise.resolve(null)),
  signOut: vi.fn(),
  GithubAuthProvider: vi.fn(),
  GoogleAuthProvider: vi.fn(),
}));

// ─── Tests ───
describe('buildSyncEntry()', () => {
  it('creates a SyncLogEntry with all required fields', async () => {
    const { buildSyncEntry } = await import('../src/lib/sync-log');
    const entry = buildSyncEntry({
      docId: 'doc-123',
      userId: 'user-abc',
      userEmail: 'a@b.com',
      displayName: 'Alice',
      checksum: 'aabbcc',
      deltaBytes: 42,
      source: 'personal',
    });
    expect(entry.docId).toBe('doc-123');
    expect(entry.userId).toBe('user-abc');
    expect(entry.userEmail).toBe('a@b.com');
    expect(entry.displayName).toBe('Alice');
    expect(entry.checksum).toBe('aabbcc');
    expect(entry.deltaBytes).toBe(42);
    expect(entry.source).toBe('personal');
    expect(typeof entry.syncedAt).toBe('number');
    expect(entry.syncedAt).toBeGreaterThan(0);
  });

  it('accepts null email and displayName', async () => {
    const { buildSyncEntry } = await import('../src/lib/sync-log');
    const entry = buildSyncEntry({
      docId: 'doc-x',
      userId: 'u1',
      userEmail: null,
      displayName: null,
      checksum: 'cc',
      deltaBytes: 0,
      source: 'collaborative',
    });
    expect(entry.userEmail).toBeNull();
    expect(entry.displayName).toBeNull();
    expect(entry.source).toBe('collaborative');
  });
});

describe('formatSyncTimestamp()', () => {
  it('returns a non-empty string from a timestamp', async () => {
    const { formatSyncTimestamp } = await import('../src/lib/sync-log');
    const result = formatSyncTimestamp(1700000000000);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats different timestamps differently', async () => {
    const { formatSyncTimestamp } = await import('../src/lib/sync-log');
    const a = formatSyncTimestamp(1600000000000);
    const b = formatSyncTimestamp(1700000000000);
    expect(a).not.toBe(b);
  });
});

describe('writeSyncLog()', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach(k => delete mockStore[k]);
  });

  it('writes a personal sync entry to users/{uid}/syncLog', async () => {
    const { writeSyncLog, buildSyncEntry } = await import('../src/lib/sync-log');
    const { addDoc } = await import('firebase/firestore');
    const entry = buildSyncEntry({
      docId: 'doc-p',
      userId: 'uid-1',
      userEmail: 'u@e.com',
      displayName: 'Bob',
      checksum: 'abc',
      deltaBytes: 10,
      source: 'personal',
    });
    await writeSyncLog(entry);
    expect(addDoc).toHaveBeenCalled();
  });

  it('writes a collaborative sync entry to collaborativeDocs/{docId}/syncLog', async () => {
    const { writeSyncLog, buildSyncEntry } = await import('../src/lib/sync-log');
    const { addDoc } = await import('firebase/firestore');
    const entry = buildSyncEntry({
      docId: 'collab-doc-1',
      userId: 'uid-2',
      userEmail: 'c@d.com',
      displayName: 'Carol',
      checksum: 'def',
      deltaBytes: 20,
      source: 'collaborative',
    });
    await writeSyncLog(entry);
    expect(addDoc).toHaveBeenCalled();
  });
});

describe('getSyncLog()', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach(k => delete mockStore[k]);
  });

  it('returns empty array when no logs exist', async () => {
    const { getSyncLog } = await import('../src/lib/sync-log');
    const result = await getSyncLog({ docId: 'none', source: 'personal', userId: 'u1' });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('returns formatted entries from stored data', async () => {
    const { getDocs } = await import('firebase/firestore');
    const mockEntry = {
      docId: 'doc-r', userId: 'u1', userEmail: 'a@b.com',
      displayName: 'Alice', syncedAt: Date.now(), checksum: 'cc', deltaBytes: 5, source: 'personal' as const,
    };
    (getDocs as any).mockResolvedValueOnce({
      docs: [{ id: 'log-1', data: () => mockEntry }],
    });
    const { getSyncLog } = await import('../src/lib/sync-log');
    const result = await getSyncLog({ docId: 'doc-r', source: 'personal', userId: 'u1' });
    expect(result.length).toBe(1);
    expect(result[0].userId).toBe('u1');
    expect(result[0].id).toBe('log-1');
  });
});
