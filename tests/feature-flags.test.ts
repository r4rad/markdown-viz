import { describe, it, expect, afterEach, vi } from 'vitest';
import { isDriveConnectorEnabled, isWikiSyncEnabled } from '../src/lib/feature-flags';

describe('feature-flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('Drive and wiki sync are off by default', () => {
    vi.stubEnv('VITE_ENABLE_DRIVE_CONNECTOR', '');
    vi.stubEnv('VITE_ENABLE_WIKI_SYNC', '');
    expect(isDriveConnectorEnabled()).toBe(false);
    expect(isWikiSyncEnabled()).toBe(false);
  });

  it('opt-in with true', () => {
    vi.stubEnv('VITE_ENABLE_DRIVE_CONNECTOR', 'true');
    vi.stubEnv('VITE_ENABLE_WIKI_SYNC', '1');
    expect(isDriveConnectorEnabled()).toBe(true);
    expect(isWikiSyncEnabled()).toBe(true);
  });
});
