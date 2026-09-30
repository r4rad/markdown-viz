import { afterEach, describe, expect, it } from 'vitest';
import { extractToken, verifyFirebaseIdToken } from '../src/middleware/auth.js';

describe('Firebase Auth verify stub (collab)', () => {
  const prevMode = process.env.FIREBASE_AUTH_MODE;

  afterEach(() => {
    if (prevMode === undefined) {
      delete process.env.FIREBASE_AUTH_MODE;
    } else {
      process.env.FIREBASE_AUTH_MODE = prevMode;
    }
  });

  it('rejects missing token', async () => {
    process.env.FIREBASE_AUTH_MODE = 'stub';
    const result = await verifyFirebaseIdToken(undefined);
    expect(result).toEqual({ ok: false, status: 401, error: 'missing_token' });
  });

  it('rejects empty token', async () => {
    process.env.FIREBASE_AUTH_MODE = 'stub';
    const result = await verifyFirebaseIdToken('   ');
    expect(result).toEqual({ ok: false, status: 401, error: 'missing_token' });
  });

  it('accepts stub tokens without secrets', async () => {
    process.env.FIREBASE_AUTH_MODE = 'stub';
    const result = await verifyFirebaseIdToken('stub:alice');
    expect(result).toEqual({ ok: true, user: { uid: 'alice' } });
  });

  it('returns not configured when verify mode lacks credentials wiring', async () => {
    process.env.FIREBASE_AUTH_MODE = 'verify';
    const result = await verifyFirebaseIdToken('real-looking-token');
    expect(result).toEqual({ ok: false, status: 501, error: 'firebase_auth_not_configured' });
  });

  it('extracts token from query or Bearer', () => {
    const url = new URL('http://localhost/doc/d1?token=stub:a');
    expect(extractToken(url, undefined)).toBe('stub:a');
    expect(extractToken(new URL('http://localhost/doc/d1'), 'Bearer stub:b')).toBe('stub:b');
    expect(extractToken(new URL('http://localhost/doc/d1'), undefined)).toBeNull();
  });
});
