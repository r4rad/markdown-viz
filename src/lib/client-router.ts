export type ClientRoute =
  | { handler: 'landing' }
  | { handler: 'app' }
  | { handler: 'share'; id: string }
  | { handler: 'invite'; id: string };

function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split('?')[0]?.split('#')[0] ?? '/';
  let path = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}

function decodeSegment(segment: string): string | null {
  try {
    const id = decodeURIComponent(segment);
    return id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Map a URL pathname to a client route.
 * Paths other than `/`, `/app`, `/shared/:id`, and `/invite/:id` use the landing entry.
 * Hosting still rewrites every path to `index.html`; this only chooses the shell.
 */
export function parseClientRoute(pathname: string): ClientRoute {
  const path = normalizePathname(pathname);
  if (path === '/') return { handler: 'landing' };
  if (path === '/app') return { handler: 'app' };

  const shared = /^\/shared\/([^/]+)$/.exec(path);
  if (shared) {
    const id = decodeSegment(shared[1]);
    if (id) return { handler: 'share', id };
  }

  const invite = /^\/invite\/([^/]+)$/.exec(path);
  if (invite) {
    const id = decodeSegment(invite[1]);
    if (id) return { handler: 'invite', id };
  }

  return { handler: 'landing' };
}
