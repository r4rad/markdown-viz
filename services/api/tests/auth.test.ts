import { afterEach, describe, expect, it } from 'vitest';
import { verifyFirebaseIdToken } from '../src/middleware/auth.js';

describe('Firebase Auth verify stub', () => {
  const prevMode = process.env.FIREBASE_AUTH_MODE;

  afterEach(() => {
    if (prevMode === undefined) {
      delete process.env.FIREBASE_AUTH_MODE;
    } else {
      process.env.FIREBASE_AUTH_MODE = prevMode;
    }
  });

  it('rejects missing bearer token', async () => {
    process.env.FIREBASE_AUTH_MODE = 'stub';
    const result = await verifyFirebaseIdToken(undefined);
    expect(result).toEqual({ ok: false, status: 401, error: 'missing_bearer_token' });
  });

  it('accepts stub tokens without secrets', async () => {
    process.env.FIREBASE_AUTH_MODE = 'stub';
    const result = await verifyFirebaseIdToken('Bearer stub:alice');
    expect(result).toEqual({ ok: true, user: { uid: 'alice' } });
  });

  it('parses stub tokens with email for invite accept', async () => {
    process.env.FIREBASE_AUTH_MODE = 'stub';
    const result = await verifyFirebaseIdToken('Bearer stub:bob:bob@example.com');
    expect(result).toEqual({ ok: true, user: { uid: 'bob', email: 'bob@example.com' } });
  });

  it('does not require GitHub secrets when mode is stub', async () => {
    process.env.FIREBASE_AUTH_MODE = 'stub';
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const result = await verifyFirebaseIdToken('Bearer any-token');
    expect(result.ok).toBe(true);
  });

  it('returns not configured when verify mode lacks credentials wiring', async () => {
    process.env.FIREBASE_AUTH_MODE = 'verify';
    const result = await verifyFirebaseIdToken('Bearer real-looking-token');
    expect(result).toEqual({ ok: false, status: 501, error: 'firebase_auth_not_configured' });
  });
});
