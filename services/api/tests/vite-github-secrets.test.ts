import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_VITE_GITHUB_SECRET_KEYS } from '../src/github/config.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

describe('no VITE_ GitHub App secrets in SPA surface', () => {
  it('root .env.example does not document VITE_ GitHub App secrets', () => {
    const text = readFileSync(join(repoRoot, '.env.example'), 'utf8');
    for (const key of FORBIDDEN_VITE_GITHUB_SECRET_KEYS) {
      expect(text).not.toContain(key);
    }
  });

  it('src/env.d.ts does not declare VITE_ GitHub App secrets', () => {
    const text = readFileSync(join(repoRoot, 'src', 'env.d.ts'), 'utf8');
    for (const key of FORBIDDEN_VITE_GITHUB_SECRET_KEYS) {
      expect(text).not.toContain(key);
    }
  });
});
