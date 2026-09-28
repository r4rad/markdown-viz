import { describe, expect, it } from 'vitest';
import { parseClientRoute } from '../src/lib/client-router';

describe('parseClientRoute', () => {
  it('routes / to the landing entry', () => {
    expect(parseClientRoute('/')).toEqual({ handler: 'landing' });
    expect(parseClientRoute('')).toEqual({ handler: 'landing' });
  });

  it('routes /app to the editor shell', () => {
    expect(parseClientRoute('/app')).toEqual({ handler: 'app' });
    expect(parseClientRoute('/app/')).toEqual({ handler: 'app' });
  });

  it('routes /shared/:id to the share handler', () => {
    expect(parseClientRoute('/shared/abc123')).toEqual({ handler: 'share', id: 'abc123' });
    expect(parseClientRoute('/shared/abc123/')).toEqual({ handler: 'share', id: 'abc123' });
    expect(parseClientRoute('/shared/a%2Fb')).toEqual({ handler: 'share', id: 'a/b' });
  });

  it('routes /invite/:id to the invite handler', () => {
    expect(parseClientRoute('/invite/inv-1')).toEqual({ handler: 'invite', id: 'inv-1' });
    expect(parseClientRoute('/invite/inv-1/')).toEqual({ handler: 'invite', id: 'inv-1' });
  });

  it('does not treat bare share or invite paths as handlers', () => {
    expect(parseClientRoute('/shared')).toEqual({ handler: 'landing' });
    expect(parseClientRoute('/shared/')).toEqual({ handler: 'landing' });
    expect(parseClientRoute('/invite')).toEqual({ handler: 'landing' });
    expect(parseClientRoute('/invite/')).toEqual({ handler: 'landing' });
  });

  it('sends unknown paths to the landing entry', () => {
    expect(parseClientRoute('/about')).toEqual({ handler: 'landing' });
    expect(parseClientRoute('/shared/abc/extra')).toEqual({ handler: 'landing' });
  });
});
