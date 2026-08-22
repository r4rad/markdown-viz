export type WikiDirection = 'pull' | 'push' | 'two-way';

export interface WikiSyncState {
  localContent: string;
  localChecksum: string;
  remoteContent: string;
  remoteChecksum: string;
  lastLocalChecksum?: string;
  lastRemoteChecksum?: string;
}

export interface WikiSyncResult {
  ok: boolean;
  conflict: boolean;
  keep: 'local' | 'remote' | 'none';
  localContent: string;
  warning?: string;
  error?: string;
}

export function evaluateTwoWay(state: WikiSyncState): WikiSyncResult {
  const localChanged = state.lastLocalChecksum
    ? state.localChecksum !== state.lastLocalChecksum
    : state.localChecksum !== state.remoteChecksum;
  const remoteChanged = state.lastRemoteChecksum
    ? state.remoteChecksum !== state.lastRemoteChecksum
    : state.localChecksum !== state.remoteChecksum;

  if (localChanged && remoteChanged && state.localChecksum !== state.remoteChecksum) {
    return {
      ok: false,
      conflict: true,
      keep: 'local',
      localContent: state.localContent,
      error: 'Two-way conflict: both sides changed. Local content was kept.',
    };
  }
  if (remoteChanged && !localChanged) {
    return { ok: true, conflict: false, keep: 'remote', localContent: state.remoteContent };
  }
  return { ok: true, conflict: false, keep: 'local', localContent: state.localContent };
}

export function applyWikiDirection(
  direction: WikiDirection,
  state: WikiSyncState,
): WikiSyncResult {
  if (direction === 'pull') {
    return { ok: true, conflict: false, keep: 'remote', localContent: state.remoteContent };
  }
  if (direction === 'push') {
    return { ok: true, conflict: false, keep: 'local', localContent: state.localContent };
  }
  return evaluateTwoWay(state);
}
