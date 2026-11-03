import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('firebase hosting rewrites', () => {
  const config = JSON.parse(
    readFileSync(resolve(__dirname, '../firebase.json'), 'utf8'),
  ) as {
    hosting: { rewrites: Array<{ source: string; destination: string }> };
  };

  it('rewrites SPA routes without a catch-all that maps missing assets to index.html', () => {
    const sources = config.hosting.rewrites.map((r) => r.source);
    expect(sources).toContain('/app');
    expect(sources).toContain('/shared/**');
    expect(sources).toContain('/invite/**');
    expect(sources).not.toContain('**');
    for (const rule of config.hosting.rewrites) {
      expect(rule.destination).toBe('/index.html');
    }
  });
});
