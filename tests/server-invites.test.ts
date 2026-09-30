import { describe, expect, it } from 'vitest';
import { inviteAcceptUrl } from '../src/lib/server-invites';

describe('server invites helpers', () => {
  it('builds /invite/:id accept URLs for the members panel copy link', () => {
    expect(inviteAcceptUrl('inv-1', 'https://app.example')).toBe('https://app.example/invite/inv-1');
    expect(inviteAcceptUrl('a/b', 'http://localhost:5173')).toBe('http://localhost:5173/invite/a%2Fb');
  });
});
