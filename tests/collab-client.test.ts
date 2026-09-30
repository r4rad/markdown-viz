import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/lib/api-client', () => ({
  getAuthBearerToken: vi.fn(),
}));

import { getAuthBearerToken } from '../src/lib/api-client';
import {
  buildCollabDocUrl,
  getCollabWsBaseUrl,
  isCollabGatewayConfigured,
} from '../src/lib/collab-client';

describe('collab-client', () => {
  const env = import.meta.env as { VITE_COLLAB_WS_URL?: string };

  beforeEach(() => {
    vi.mocked(getAuthBearerToken).mockReset();
  });

  afterEach(() => {
    delete env.VITE_COLLAB_WS_URL;
  });

  it('is disabled when VITE_COLLAB_WS_URL is unset', () => {
    delete env.VITE_COLLAB_WS_URL;
    expect(getCollabWsBaseUrl()).toBeNull();
    expect(isCollabGatewayConfigured()).toBe(false);
  });

  it('builds doc WS URL with token when configured', async () => {
    env.VITE_COLLAB_WS_URL = 'ws://localhost:8081/';
    vi.mocked(getAuthBearerToken).mockResolvedValue('stub:alice');

    expect(isCollabGatewayConfigured()).toBe(true);
    expect(getCollabWsBaseUrl()).toBe('ws://localhost:8081');

    const url = await buildCollabDocUrl('doc/1');
    expect(url).toBe('ws://localhost:8081/doc/doc%2F1?token=stub%3Aalice');
  });

  it('returns null when signed out', async () => {
    env.VITE_COLLAB_WS_URL = 'ws://localhost:8081';
    vi.mocked(getAuthBearerToken).mockResolvedValue(null);
    expect(await buildCollabDocUrl('d1')).toBeNull();
  });
});
