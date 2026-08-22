const WRITE_PREF_KEY = 'markdownviz-github-write';
const PAT_SESSION_KEY = 'markdownviz-github-pat';

let oauthAccessToken: string | null = null;

export function setGithubOauthToken(token: string | null): void {
  oauthAccessToken = token;
}

export function getGithubWritePref(): boolean {
  try {
    return localStorage.getItem(WRITE_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

export function setGithubWritePref(enabled: boolean): void {
  try {
    localStorage.setItem(WRITE_PREF_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function setSessionGithubPat(pat: string | null): void {
  try {
    if (!pat) sessionStorage.removeItem(PAT_SESSION_KEY);
    else sessionStorage.setItem(PAT_SESSION_KEY, pat);
  } catch {
    /* ignore */
  }
}

export function getSessionGithubPat(): string | null {
  try {
    return sessionStorage.getItem(PAT_SESSION_KEY);
  } catch {
    return null;
  }
}

/** Session PAT first (user-managed), then in-memory OAuth token. Never persisted to Firestore. */
export function getGithubToken(): string | null {
  return getSessionGithubPat() || oauthAccessToken;
}

export function redactSecrets(message: string): string {
  return message
    .replace(/ghp_[A-Za-z0-9]+/g, 'ghp_[REDACTED]')
    .replace(/github_pat_[A-Za-z0-9_]+/g, 'github_pat_[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
}
