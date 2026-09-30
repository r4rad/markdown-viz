import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

vi.mock('firebase/app', () => ({
  getApps: () => [{}],
  getApp: () => ({}),
  initializeApp: () => ({}),
}));

const mockSet = vi.fn(async () => undefined);
const mockUpdate = vi.fn(async () => undefined);
const mockRemove = vi.fn(async () => undefined);
const mockOnDisconnectRemove = vi.fn(async () => undefined);
const mockOnDisconnectCancel = vi.fn(async () => undefined);
let onValueCb: ((snap: { val: () => unknown }) => void) | null = null;

vi.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db: unknown, path: string) => ({ path }),
  set: (...args: unknown[]) => mockSet(...args),
  update: (...args: unknown[]) => mockUpdate(...args),
  remove: (...args: unknown[]) => mockRemove(...args),
  onDisconnect: () => ({
    remove: mockOnDisconnectRemove,
    cancel: mockOnDisconnectCancel,
  }),
  onValue: (_ref: unknown, cb: (snap: { val: () => unknown }) => void) => {
    onValueCb = cb;
    return () => { onValueCb = null; };
  },
}));

vi.mock('../src/lib/firebase-config', () => ({
  isFirebaseConfigured: () => true,
  default: { projectId: 'test' },
}));

vi.mock('../src/lib/auth', () => ({
  getCurrentUser: vi.fn(() => null),
}));

vi.mock('../src/lib/state', () => ({
  getState: vi.fn(() => ({ activeWorkspaceId: 'personal', currentRole: null })),
  getActiveTab: vi.fn(() => null),
}));

describe('colorForUid / parsePresenceSnapshot', () => {
  it('returns a stable color for the same uid', async () => {
    const { colorForUid } = await import('../src/lib/presence');
    expect(colorForUid('alice')).toBe(colorForUid('alice'));
    expect(colorForUid('alice')).not.toBe(colorForUid('bob'));
  });

  it('parses peers and excludes local uid', async () => {
    const { parsePresenceSnapshot } = await import('../src/lib/presence');
    const peers = parsePresenceSnapshot({
      me: { displayName: 'Me', color: '#111', updatedAt: 1, cursor: { anchor: 0, head: 0 } },
      peer: {
        displayName: 'Peer',
        color: '#e11d48',
        photoURL: null,
        updatedAt: 2,
        cursor: { anchor: 3, head: 5 },
        selection: { anchor: 3, head: 5 },
      },
    }, 'me');

    expect(peers).toHaveLength(1);
    expect(peers[0].uid).toBe('peer');
    expect(peers[0].cursor).toEqual({ anchor: 3, head: 5 });
    expect(peers[0].displayName).toBe('Peer');
  });
});

describe('joinPresence / onDisconnect', () => {
  beforeEach(async () => {
    mockSet.mockClear();
    mockUpdate.mockClear();
    mockRemove.mockClear();
    mockOnDisconnectRemove.mockClear();
    mockOnDisconnectCancel.mockClear();
    onValueCb = null;
    const { leavePresence } = await import('../src/lib/presence');
    await leavePresence();
  });

  afterEach(async () => {
    const { leavePresence } = await import('../src/lib/presence');
    await leavePresence();
  });

  it('publishes presence and registers onDisconnect remove', async () => {
    const { joinPresence, leavePresence, getActivePresenceDocId } = await import('../src/lib/presence');

    const ok = await joinPresence('doc-1', {
      uid: 'u1',
      displayName: 'Ada',
      photoURL: null,
    });
    expect(ok).toBe(true);
    expect(getActivePresenceDocId()).toBe('doc-1');
    expect(mockOnDisconnectRemove).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalled();
    const payload = mockSet.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.displayName).toBe('Ada');
    expect(payload.color).toBeTruthy();

    await leavePresence();
    expect(mockRemove).toHaveBeenCalled();
    expect(getActivePresenceDocId()).toBeNull();
  });

  it('emits presence-changed when peers update', async () => {
    const { on } = await import('../src/lib/events');
    const { joinPresence } = await import('../src/lib/presence');
    const seen: unknown[] = [];
    const off = on('presence-changed', (p) => { seen.push(p); });

    await joinPresence('doc-2', { uid: 'u1', displayName: 'Ada' });
    onValueCb?.({
      val: () => ({
        u1: { displayName: 'Ada', color: '#111', updatedAt: 1 },
        u2: {
          displayName: 'Bob',
          color: '#2563eb',
          updatedAt: 2,
          cursor: { anchor: 1, head: 1 },
        },
      }),
    });

    expect(seen.length).toBeGreaterThan(0);
    const last = seen[seen.length - 1] as Array<{ uid: string }>;
    expect(last.map((p) => p.uid)).toEqual(['u2']);
    off();
  });
});

describe('buildRemoteCursorDecorations', () => {
  it('creates decorations for peer cursor and selection', async () => {
    const { buildRemoteCursorDecorations } = await import('../src/lib/remote-cursors');
    const deco = buildRemoteCursorDecorations([
      {
        uid: 'p1',
        displayName: 'Peer',
        color: '#e11d48',
        photoURL: null,
        cursor: { anchor: 2, head: 5 },
        selection: { anchor: 2, head: 5 },
        updatedAt: 1,
      },
    ], 20);

    let count = 0;
    deco.between(0, 20, () => { count += 1; });
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('applies setRemotePresence via editor extension', async () => {
    const { remotePresenceExtension, setRemotePresence } = await import('../src/lib/remote-cursors');
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc: 'hello world',
        extensions: [remotePresenceExtension()],
      }),
      parent,
    });

    view.dispatch({
      effects: setRemotePresence.of([
        {
          uid: 'p1',
          displayName: 'Peer',
          color: '#2563eb',
          photoURL: null,
          cursor: { anchor: 3, head: 3 },
          selection: { anchor: 3, head: 3 },
          updatedAt: 1,
        },
      ]),
    });

    expect(view.dom.querySelector('.cm-remote-cursor')).toBeTruthy();
    view.destroy();
    parent.remove();
  });
});
