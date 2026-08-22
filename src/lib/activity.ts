import type { ActivityAction, ActivityEvent, Role } from '../types';
import { canQueryWorkspaceActivity, canReadActivity } from './workspace-acl';

export const ACTIVITY_DEFAULT_MS = 30 * 24 * 60 * 60 * 1000;
export const ACTIVITY_MAX_MS = 90 * 24 * 60 * 60 * 1000;

export function normalizeActorId(uid: string | null | undefined): string | 'unknown' {
  return uid && uid.trim() ? uid : 'unknown';
}

export function buildActivityEvent(input: {
  workspaceId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  action: ActivityAction;
  fileId?: string;
  checksum?: string;
  meta?: Record<string, string>;
  now?: number;
  id?: string;
}): ActivityEvent {
  return {
    id: input.id ?? crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actorId: normalizeActorId(input.actorId),
    actorEmail: input.actorEmail ?? null,
    action: input.action,
    fileId: input.fileId,
    createdAt: input.now ?? Date.now(),
    checksum: input.checksum,
    meta: input.meta,
  };
}

export function filterActivity(
  events: ActivityEvent[],
  opts: {
    role: Role | null;
    authUid: string;
    actorId?: string;
    action?: ActivityAction;
    from: number;
    to: number;
    workspaceWide: boolean;
  },
): ActivityEvent[] | { denied: true } {
  const span = opts.to - opts.from;
  const from = span > ACTIVITY_MAX_MS ? opts.to - ACTIVITY_MAX_MS : opts.from;
  if (opts.workspaceWide && !canQueryWorkspaceActivity(opts.role)) {
    return { denied: true };
  }
  return events
    .filter(e => e.createdAt >= from && e.createdAt <= opts.to)
    .filter(e => canReadActivity(opts.role, String(e.actorId), opts.authUid))
    .filter(e => !opts.actorId || e.actorId === opts.actorId)
    .filter(e => !opts.action || e.action === opts.action)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function activityToCsv(events: ActivityEvent[]): string {
  const header = 'id,workspaceId,actorId,actorEmail,action,fileId,createdAt,checksum';
  const rows = events.map(e =>
    [e.id, e.workspaceId, e.actorId, e.actorEmail ?? '', e.action, e.fileId ?? '', e.createdAt, e.checksum ?? '']
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header, ...rows].join('\n');
}

export function activityToMarkdown(events: ActivityEvent[]): string {
  const lines = [
    '| Time | Actor | Action | File |',
    '| --- | --- | --- | --- |',
    ...events.map(e =>
      `| ${new Date(e.createdAt).toISOString()} | ${e.actorEmail || e.actorId} | ${e.action} | ${e.fileId ?? ''} |`,
    ),
  ];
  return lines.join('\n');
}
