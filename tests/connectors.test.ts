import { describe, it, expect } from 'vitest';
import { driveConnector } from '../src/lib/connectors/drive';
import { githubConnector } from '../src/lib/connectors/github';
import { listConnectors } from '../src/lib/connectors';
import { redactSecrets } from '../src/lib/github-token';

describe('connectors', () => {
  it('registers github and drive', () => {
    const ids = listConnectors().map(c => c.id);
    expect(ids).toEqual(['github', 'drive', 'confluence', 'notion']);
  });

  it('Drive stub is unavailable and NOT_IMPLEMENTED', async () => {
    expect(driveConnector.isAvailable()).toBe(false);
    const result = await driveConnector.exportFile({ content: 'x', path: 'a.md', message: 'm' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_IMPLEMENTED');
      expect(result.error).toMatch(/not saved to Drive/i);
    }
  });

  it('GitHub export without token does not claim success', async () => {
    const result = await githubConnector.exportFile({
      content: 'hi',
      path: 'README.md',
      message: 'update',
      target: { owner: 'o', repo: 'r', ref: 'main' },
    });
    expect(result.ok).toBe(false);
  });

  it('redacts tokens from log-like strings', () => {
    expect(redactSecrets('Bearer abc.def.ghi ghp_secret123456')).not.toMatch(/ghp_secret/);
    expect(redactSecrets('Bearer abc.def.ghi')).not.toMatch(/abc.def.ghi/);
  });
});
