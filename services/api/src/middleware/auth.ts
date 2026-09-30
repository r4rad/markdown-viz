import type { IncomingMessage } from 'node:http';

export type AuthUser = {
  uid: string;
  email?: string;
};

export type AuthOk = { ok: true; user: AuthUser };
export type AuthFail = { ok: false; status: number; error: string };
export type AuthResult = AuthOk | AuthFail;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1]!, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as unknown;
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Parse stub tokens:
 * - `stub:uid`
 * - `stub:uid:email@example.com`
 * Or decode JWT payload without signature verify (local/CI stub only).
 */
function parseStubUser(token: string): AuthUser {
  if (token.startsWith('stub:')) {
    const rest = token.slice('stub:'.length);
    const colon = rest.indexOf(':');
    if (colon === -1) {
      return { uid: rest || 'stub-user' };
    }
    const uid = rest.slice(0, colon) || 'stub-user';
    const email = rest.slice(colon + 1).trim();
    return email ? { uid, email } : { uid };
  }

  const payload = decodeJwtPayload(token);
  if (payload) {
    const uid =
      (typeof payload.user_id === 'string' && payload.user_id) ||
      (typeof payload.sub === 'string' && payload.sub) ||
      'stub-user';
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    return { uid, email };
  }

  return { uid: 'stub-user' };
}

/**
 * Firebase Auth ID token verification stub.
 *
 * Production path will call firebase-admin verifyIdToken with credentials from
 * Secret Manager / Cloud Run. This scaffold never reads secrets from the repo.
 */
export async function verifyFirebaseIdToken(
  authorizationHeader: string | undefined,
): Promise<AuthResult> {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'missing_bearer_token' };
  }

  const token = authorizationHeader.slice('Bearer '.length).trim();
  if (!token) {
    return { ok: false, status: 401, error: 'empty_token' };
  }

  const mode = process.env.FIREBASE_AUTH_MODE ?? 'stub';

  if (mode === 'stub') {
    return { ok: true, user: parseStubUser(token) };
  }

  // Real verify not wired yet — avoids requiring GitHub/Firebase secrets in CI.
  return { ok: false, status: 501, error: 'firebase_auth_not_configured' };
}

export async function requireAuth(req: IncomingMessage): Promise<AuthResult> {
  return verifyFirebaseIdToken(req.headers.authorization);
}
