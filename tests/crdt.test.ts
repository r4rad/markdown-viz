import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('firebase/app', () => ({
  getApps: () => [{}],
  getApp: () => ({}),
  initializeApp: () => ({}),
}));

const mockUpdatesStore: Record<string, any[]> = {};
const mockDocStore: Record<string, any> = {};
let mockOnSnapshotCb: ((snap: any) => void) | null = null;

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: (_db: any, ...path: string[]) => ({ path: path.join('/') }),
  collection: (_db: any, ...path: string[]) => ({ path: path.join('/') }),
  addDoc: vi.fn(async (ref: any, data: any) => {
    const arr = mockUpdatesStore[ref.path] ?? [];
    arr.push(data);
    mockUpdatesStore[ref.path] = arr;
    return { id: String(arr.length) };
  }),
  setDoc: vi.fn(async (ref: any, data: any) => {
    mockDocStore[ref.path] = data;
  }),
  getDoc: vi.fn(async (ref: any) => {
    const data = mockDocStore[ref.path];
    return { exists: () => !!data, data: () => data };
  }),
  getDocs: vi.fn(async (ref: any) => {
    const arr = mockUpdatesStore[ref.path] ?? [];
    return {
      docs: arr.map((d, i) => ({ id: String(i), data: () => d })),
    };
  }),
  onSnapshot: vi.fn((ref: any, cb: (snap: any) => void) => {
    mockOnSnapshotCb = cb;
    return () => { mockOnSnapshotCb = null; };
  }),
  query: vi.fn((ref: any) => ref),
  orderBy: vi.fn(),
  serverTimestamp: () => Date.now(),
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
describe('computeChecksum()', () => {
  it('returns a 64-char hex SHA-256 string', async () => {
    const { computeChecksum } = await import('../src/lib/crdt');
    const result = await computeChecksum('hello world');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('returns the same hash for identical input', async () => {
    const { computeChecksum } = await import('../src/lib/crdt');
    const a = await computeChecksum('same content');
    const b = await computeChecksum('same content');
    expect(a).toBe(b);
  });

  it('returns different hashes for different inputs', async () => {
    const { computeChecksum } = await import('../src/lib/crdt');
    const a = await computeChecksum('content A');
    const b = await computeChecksum('content B');
    expect(a).not.toBe(b);
  });

  it('handles empty string', async () => {
    const { computeChecksum } = await import('../src/lib/crdt');
    const result = await computeChecksum('');
    expect(result).toHaveLength(64);
  });
});

describe('uint8ArrayToBase64() / base64ToUint8Array()', () => {
  it('round-trips a Uint8Array through base64', async () => {
    const { uint8ArrayToBase64, base64ToUint8Array } = await import('../src/lib/crdt');
    const original = new Uint8Array([1, 2, 3, 200, 255, 0]);
    const b64 = uint8ArrayToBase64(original);
    expect(typeof b64).toBe('string');
    const restored = base64ToUint8Array(b64);
    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  it('encodes empty array', async () => {
    const { uint8ArrayToBase64, base64ToUint8Array } = await import('../src/lib/crdt');
    const b64 = uint8ArrayToBase64(new Uint8Array([]));
    expect(b64).toBe('');
    const restored = base64ToUint8Array(b64);
    expect(restored.length).toBe(0);
  });
});

describe('initCollaborativeDoc()', () => {
  beforeEach(() => {
    Object.keys(mockUpdatesStore).forEach(k => delete mockUpdatesStore[k]);
    Object.keys(mockDocStore).forEach(k => delete mockDocStore[k]);
  });

  it('returns a session object with docId and destroy function', async () => {
    const { initCollaborativeDoc } = await import('../src/lib/crdt');
    const session = await initCollaborativeDoc('doc-1', 'Hello', () => {});
    expect(session.docId).toBe('doc-1');
    expect(typeof session.destroy).toBe('function');
    session.destroy();
  });

  it('calls onContentChange with initial content', async () => {
    const { initCollaborativeDoc } = await import('../src/lib/crdt');
    const changes: string[] = [];
    const session = await initCollaborativeDoc('doc-init', 'Initial content', (c) => changes.push(c));
    expect(changes).toContain('Initial content');
    session.destroy();
  });

  it('destroy cleans up without throwing', async () => {
    const { initCollaborativeDoc } = await import('../src/lib/crdt');
    const session = await initCollaborativeDoc('doc-destroy', 'content', () => {});
    expect(() => session.destroy()).not.toThrow();
  });

  it('exposes getContent() returning current CRDT text', async () => {
    const { initCollaborativeDoc } = await import('../src/lib/crdt');
    const session = await initCollaborativeDoc('doc-get', 'The content', () => {});
    expect(session.getContent()).toBe('The content');
    session.destroy();
  });

  it('applyRemoteContent() updates the CRDT and calls onContentChange', async () => {
    const { initCollaborativeDoc } = await import('../src/lib/crdt');
    const changes: string[] = [];
    const session = await initCollaborativeDoc('doc-remote', 'original', (c) => changes.push(c));
    session.applyRemoteContent('updated by peer');
    expect(session.getContent()).toBe('updated by peer');
    expect(changes).toContain('updated by peer');
    session.destroy();
  });
});

describe('buildCrdtUpdate()', () => {
  it('returns a CrdtUpdate with all required fields', async () => {
    const { buildCrdtUpdate } = await import('../src/lib/crdt');
    const update = buildCrdtUpdate({
      update: new Uint8Array([1, 2, 3]),
      userId: 'user-abc',
      userEmail: 'a@b.com',
      checksum: 'aabbcc',
      deltaBytes: 3,
    });
    expect(update.userId).toBe('user-abc');
    expect(update.userEmail).toBe('a@b.com');
    expect(update.checksum).toBe('aabbcc');
    expect(update.deltaBytes).toBe(3);
    expect(typeof update.timestamp).toBe('number');
    expect(Array.isArray(update.update)).toBe(true);
  });
});
