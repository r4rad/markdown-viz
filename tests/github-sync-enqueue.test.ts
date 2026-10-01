import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  shouldScheduleSyncEnqueue,
  SYNC_QUIET_SETTLE_MS,
} from '../src/lib/github-sync-enqueue';

describe('github sync enqueue helpers', () => {
  it('exposes ~30s quiet settle constant', () => {
    expect(SYNC_QUIET_SETTLE_MS).toBe(30_000);
  });

  it('schedules only for editor+ shared workspaces when API is configured', () => {
    expect(
      shouldScheduleSyncEnqueue({
        apiConfigured: true,
        workspaceId: 'ws-1',
        role: 'editor',
        documentId: 'doc-1',
      }),
    ).toBe(true);
    expect(
      shouldScheduleSyncEnqueue({
        apiConfigured: true,
        workspaceId: 'ws-1',
        role: 'owner',
        documentId: 'doc-1',
      }),
    ).toBe(true);
    expect(
      shouldScheduleSyncEnqueue({
        apiConfigured: true,
        workspaceId: 'ws-1',
        role: 'viewer',
        documentId: 'doc-1',
      }),
    ).toBe(false);
    expect(
      shouldScheduleSyncEnqueue({
        apiConfigured: true,
        workspaceId: 'personal',
        role: 'owner',
        documentId: 'doc-1',
      }),
    ).toBe(false);
    expect(
      shouldScheduleSyncEnqueue({
        apiConfigured: false,
        workspaceId: 'ws-1',
        role: 'editor',
        documentId: 'doc-1',
      }),
    ).toBe(false);
  });
});

describe('setupQuietSyncEnqueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('enqueues after ~30s settle on content-changed', async () => {
    vi.doMock('../src/lib/api-client', () => ({
      isApiConfigured: () => true,
      apiFetch: vi.fn(),
    }));
    vi.doMock('../src/lib/state', () => ({
      getState: () => ({
        activeWorkspaceId: 'ws-1',
        currentRole: 'editor',
      }),
      getActiveTab: () => ({ id: 'doc-1' }),
    }));

    const enqueue = vi.fn().mockResolvedValue({ id: 'job-1' });
    const { emit } = await import('../src/lib/events');
    const { setupQuietSyncEnqueue } = await import('../src/lib/quiet-sync-enqueue');

    const stop = setupQuietSyncEnqueue({ settleMs: 30_000, enqueue });
    emit('content-changed');
    expect(enqueue).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(29_999);
    expect(enqueue).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(enqueue).toHaveBeenCalledWith('doc-1', 'ws-1');
    stop();
  });
});
