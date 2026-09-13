/** Pure helpers for personal cloud file sync (no Firebase). */

export type SyncableTab = { id: string; updatedAt?: number };

export type PersonalCloudFileSyncPlan = {
  /** Tab ids to upsert this run (capped, most recently updated first). */
  upsertTabIds: string[];
  /**
   * Remote file ids to delete during sync.
   * Always empty: out-of-cap / unrelated remotes must not be wiped silently.
   * Explicit user deletes go through deleteCloudFile.
   */
  deleteRemoteIds: string[];
};

/** Most recently updated tabs, up to maxSyncTabs. */
export function selectTabsForCloudSync(
  tabs: SyncableTab[],
  maxSyncTabs: number,
): SyncableTab[] {
  const limit = Number.isFinite(maxSyncTabs) && maxSyncTabs > 0 ? maxSyncTabs : 10;
  return [...tabs]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, limit);
}

/**
 * Plan personal file sync: upsert capped tabs; never delete remotes solely
 * because they fall outside the client tab cap or are absent from this batch.
 */
export function planPersonalCloudFileSync(
  tabs: SyncableTab[],
  remoteFileIds: string[],
  maxSyncTabs: number,
): PersonalCloudFileSyncPlan {
  const upsertTabIds = selectTabsForCloudSync(tabs, maxSyncTabs).map((t) => t.id);
  // Never delete remotes during capped sync — including out-of-cap / unrelated ids.
  const deleteRemoteIds = remoteFileIds.filter(() => false);
  return { upsertTabIds, deleteRemoteIds };
}
