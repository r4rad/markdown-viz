import { getAuthBearerToken } from './api-client';

/** Collab gateway WebSocket base URL (e.g. ws://localhost:8081). Empty disables. */
export function getCollabWsBaseUrl(): string | null {
  const raw = (import.meta.env.VITE_COLLAB_WS_URL as string | undefined)?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

export function isCollabGatewayConfigured(): boolean {
  return !!getCollabWsBaseUrl();
}

/**
 * Build `ws(s)://…/doc/:documentId?token=…` for the collab gateway.
 * Returns null when the gateway URL or token is unavailable.
 */
export async function buildCollabDocUrl(documentId: string): Promise<string | null> {
  const base = getCollabWsBaseUrl();
  if (!base) return null;

  const token = await getAuthBearerToken();
  if (!token) return null;

  const path = `/doc/${encodeURIComponent(documentId)}`;
  const url = new URL(`${base}${path}`);
  url.searchParams.set('token', token);
  return url.toString();
}
