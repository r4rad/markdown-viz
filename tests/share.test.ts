import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
vi.mock('firebase/app', () => ({
  getApps: () => [{}],
  getApp: () => ({}),
  initializeApp: () => ({}),
}));

vi.mock('firebase/firestore', () => {
  const store: Record<string, any> = {};
  return {
    getFirestore: () => ({}),
    doc: (_db: any, ...path: string[]) => ({ path: path.join('/') }),
    setDoc: vi.fn(async (ref: any, data: any) => {
      store[ref.path] = data;
    }),
    getDoc: vi.fn(async (ref: any) => {
      const data = store[ref.path];
      return {
        exists: () => !!data,
        data: () => data,
        id: ref.path.split('/').pop(),
      };
    }),
    collection: vi.fn(),
    getDocs: vi.fn(),
    deleteDoc: vi.fn(),
  };
});

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
describe('Share Feature', () => {
  describe('isSharingEnabled()', () => {
    it('should return true by default', async () => {
      const { isSharingEnabled } = await import('../src/lib/share');
      expect(isSharingEnabled()).toBe(true);
    });
  });

  describe('getShareIdFromURL()', () => {
    it('should return null for normal URLs', async () => {
      const { getShareIdFromURL } = await import('../src/lib/share');
      expect(getShareIdFromURL('https://example.com/')).toBeNull();
      expect(getShareIdFromURL('https://example.com/about')).toBeNull();
    });

    it('should extract share ID from /shared/{id} path', async () => {
      const { getShareIdFromURL } = await import('../src/lib/share');
      expect(getShareIdFromURL('https://example.com/shared/abc123')).toBe('abc123');
    });

    it('should handle trailing slashes', async () => {
      const { getShareIdFromURL } = await import('../src/lib/share');
      expect(getShareIdFromURL('https://example.com/shared/abc123/')).toBe('abc123');
    });

    it('should return null for /shared/ with no ID', async () => {
      const { getShareIdFromURL } = await import('../src/lib/share');
      expect(getShareIdFromURL('https://example.com/shared/')).toBeNull();
      expect(getShareIdFromURL('https://example.com/shared')).toBeNull();
    });
  });

  describe('buildShareURL()', () => {
    it('should build a valid share URL', async () => {
      const { buildShareURL } = await import('../src/lib/share');
      const url = buildShareURL('doc123');
      expect(url).toContain('/shared/doc123');
    });
  });

  describe('loadSharedDocument()', () => {
    it('should return null for non-existent doc', async () => {
      const { getDoc } = await import('firebase/firestore');
      (getDoc as any).mockResolvedValueOnce({
        exists: () => false,
        data: () => null,
        id: 'nonexistent',
      });
      const { loadSharedDocument } = await import('../src/lib/share');
      const result = await loadSharedDocument('nonexistent');
      expect(result).toBeNull();
    });
  });
});
