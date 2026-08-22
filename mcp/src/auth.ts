export interface AuthEnv {
  MARKDOWNVIZ_FIREBASE_ID_TOKEN?: string;
  MARKDOWNVIZ_FIREBASE_API_KEY?: string;
  MARKDOWNVIZ_USER_ID?: string;
  MARKDOWNVIZ_ALLOW_UNVERIFIED_UID?: string;
  GITHUB_TOKEN?: string;
}

export interface LookupAccount {
  (idToken: string, apiKey: string): Promise<{ localId?: string } | null>;
}

export async function resolveAuthenticatedUser(
  env: AuthEnv,
  lookup: LookupAccount = defaultLookup,
): Promise<{ uid: string } | { error: string }> {
  const token = env.MARKDOWNVIZ_FIREBASE_ID_TOKEN?.trim();
  if (!token) {
    if (env.MARKDOWNVIZ_ALLOW_UNVERIFIED_UID === '1' && env.MARKDOWNVIZ_USER_ID) {
      return { uid: env.MARKDOWNVIZ_USER_ID };
    }
    return { error: 'Missing credentials. Set MARKDOWNVIZ_FIREBASE_ID_TOKEN (or unverified uid only with MARKDOWNVIZ_ALLOW_UNVERIFIED_UID=1 for local dev).' };
  }
  const apiKey = env.MARKDOWNVIZ_FIREBASE_API_KEY?.trim();
  if (!apiKey) {
    return { error: 'Invalid credentials: MARKDOWNVIZ_FIREBASE_API_KEY is required to verify the ID token.' };
  }
  const account = await lookup(token, apiKey);
  if (!account?.localId) return { error: 'Invalid credentials: ID token could not be verified.' };
  return { uid: account.localId };
}

async function defaultLookup(idToken: string, apiKey: string): Promise<{ localId?: string } | null> {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { users?: Array<{ localId?: string }> };
  return data.users?.[0] ?? null;
}
