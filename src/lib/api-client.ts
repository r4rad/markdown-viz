import { getCurrentUser } from './auth';

/** Cloud Run API base URL. Empty/unset disables server invite calls. */
export function getApiBaseUrl(): string | null {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

export function isApiConfigured(): boolean {
  return !!getApiBaseUrl();
}

export type ApiError = { status: number; error: string };

export async function getAuthBearerToken(): Promise<string | null> {
  const user = getCurrentUser();
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Authenticated fetch against the Cloud Run API.
 * Throws Error with message from JSON `error` field when status is not ok.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) throw new Error('API not configured (set VITE_API_BASE_URL)');

  const token = await getAuthBearerToken();
  if (!token) throw new Error('Sign in required for API calls');

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const res = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers,
  });

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { error: text };
    }
  }

  if (!res.ok) {
    const err =
      json && typeof json === 'object' && 'error' in json
        ? String((json as { error: unknown }).error)
        : `api_${res.status}`;
    throw new Error(err);
  }

  return json as T;
}
