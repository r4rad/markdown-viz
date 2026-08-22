import { describe, it, expect } from 'vitest';
import { buildActivityEvent, filterActivity, activityToCsv, activityToMarkdown, ACTIVITY_MAX_MS } from '../src/lib/activity';

describe('activity', () => {
  it('stores unknown actor rather than dropping', () => {
    const e = buildActivityEvent({ workspaceId: 'w', actorId: null, action: 'edit' });
    expect(e.actorId).toBe('unknown');
  });

  it('denies workspace-wide report for non-owners', () => {
    const events = [buildActivityEvent({ workspaceId: 'w', actorId: 'u1', action: 'edit', now: Date.now() })];
    const denied = filterActivity(events, {
      role: 'editor',
      authUid: 'u1',
      from: Date.now() - 1000,
      to: Date.now(),
      workspaceWide: true,
    });
    expect(denied).toEqual({ denied: true });
  });

  it('owner can filter and export', () => {
    const now = Date.now();
    const events = [
      buildActivityEvent({ workspaceId: 'w', actorId: 'a', action: 'edit', now: now - 10, id: '1' }),
      buildActivityEvent({ workspaceId: 'w', actorId: 'b', action: 'sync', now: now - 5, id: '2' }),
    ];
    const rows = filterActivity(events, {
      role: 'owner',
      authUid: 'owner',
      action: 'sync',
      from: now - ACTIVITY_MAX_MS,
      to: now,
      workspaceWide: true,
    });
    expect(Array.isArray(rows) && rows).toHaveLength(1);
    if (Array.isArray(rows)) {
      expect(activityToCsv(rows)).toContain('sync');
      expect(activityToMarkdown(rows)).toContain('|');
    }
  });
});
