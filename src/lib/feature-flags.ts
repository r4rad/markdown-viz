/** Production UI gates for incomplete / stubbed surfaces (task 0.1). */

function envFlag(name: keyof ImportMetaEnv, defaultOn = false): boolean {
  const val = import.meta.env[name];
  if (val === undefined || val === '') return defaultOn;
  return val === 'true' || val === '1';
}

/** Google Drive connector is a Phase-1 stub — off in production UI by default. */
export function isDriveConnectorEnabled(): boolean {
  return envFlag('VITE_ENABLE_DRIVE_CONNECTOR', false);
}

/** Confluence/Notion wiki sync UI — gated until sync is production-ready. */
export function isWikiSyncEnabled(): boolean {
  return envFlag('VITE_ENABLE_WIKI_SYNC', false);
}
