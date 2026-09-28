import type { IncomingMessage } from 'node:http';

export type AuthUser = {
  uid: string;
  email?: string;
};

export type AuthOk = { ok: true; user: AuthUser };
export type AuthFail = { ok: false; status: number; error: string };
export type AuthResult = AuthOk | AuthFail;

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
    const uid = token.startsWith('stub:') ? token.slice('stub:'.length) || 'stub-user' : 'stub-user';
    return { ok: true, user: { uid } };
  }

  // Real verify not wired yet — avoids requiring GitHub/Firebase secrets in CI.
  return { ok: false, status: 501, error: 'firebase_auth_not_configured' };
}

export async function requireAuth(req: IncomingMessage): Promise<AuthResult> {
  return verifyFirebaseIdToken(req.headers.authorization);
}
