import { describe, it, expect } from 'vitest';
import {
  allowsPersonalCloudSync,
  isPersonalWorkspaceId,
  planPersonalCloudFileSync,
  selectTabsForCloudSync,
} from '../src/lib/personal-cloud-sync';

describe('personal cloud sync (safe)', () => {
  it('selects most recently updated tabs up to the cap', () => {
    const tabs = [
      { id: 'old', updatedAt: 1 },
      { id: 'mid', updatedAt: 2 },
      { id: 'new', updatedAt: 3 },
    ];
    expect(selectTabsForCloudSync(tabs, 2).map((t) => t.id)).toEqual(['new', 'mid']);
  });

  it('does not delete remote files solely because they fall outside the tab cap', () => {
    const localTabs = [
      { id: 't1', updatedAt: 10 },
      { id: 't2', updatedAt: 9 },
      { id: 't3', updatedAt: 8 },
    ];
    const remoteIds = ['t1', 't2', 't3', 'remote-only', 'older-remote'];
    const plan = planPersonalCloudFileSync(localTabs, remoteIds, 2);

    expect(plan.upsertTabIds).toEqual(['t1', 't2']);
    expect(plan.deleteRemoteIds).toEqual([]);
    for (const id of ['t3', 'remote-only', 'older-remote']) {
      expect(plan.deleteRemoteIds).not.toContain(id);
    }
  });

  it('upserts without wiping unrelated remote files when local set is a subset', () => {
    const plan = planPersonalCloudFileSync(
      [{ id: 'a', updatedAt: 1 }],
      ['a', 'b', 'c'],
      10,
    );
    expect(plan.upsertTabIds).toEqual(['a']);
    expect(plan.deleteRemoteIds).toEqual([]);
  });
});

describe('workspace isolation for personal cloud sync', () => {
  it('allows personal sync only for the personal workspace id', () => {
    expect(isPersonalWorkspaceId('personal')).toBe(true);
    expect(allowsPersonalCloudSync('personal')).toBe(true);
  });

  it('blocks personal sync after switching to a shared workspace', () => {
    const sharedWorkspaceId = 'ws-shared-abc';
    // Simulate: user switched personal → shared; state.tabs are shared docs.
    expect(allowsPersonalCloudSync(sharedWorkspaceId)).toBe(false);
    // Planning shared tabs must not imply they are eligible for personal upsert —
    // callers must gate with allowsPersonalCloudSync before writing users/{uid}/files.
    const sharedTabs = [
      { id: 'shared-doc-1', updatedAt: 100 },
      { id: 'shared-doc-2', updatedAt: 90 },
    ];
    const plan = planPersonalCloudFileSync(sharedTabs, [], 10);
    expect(plan.upsertTabIds).toEqual(['shared-doc-1', 'shared-doc-2']);
    expect(allowsPersonalCloudSync(sharedWorkspaceId)).toBe(false);
  });

  it('blocks personal sync for org and guest workspace ids', () => {
    expect(allowsPersonalCloudSync('org-acme-1')).toBe(false);
    expect(allowsPersonalCloudSync('guest-invite-9')).toBe(false);
    expect(allowsPersonalCloudSync(null)).toBe(false);
    expect(allowsPersonalCloudSync(undefined)).toBe(false);
  });
});
