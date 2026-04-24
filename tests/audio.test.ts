import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AUDIO_GENERATOR_VERSION } from '../src/types';

// ─── Mocks ───
vi.mock('firebase/app', () => ({
  getApps: () => [{}],
  getApp: () => ({}),
  initializeApp: () => ({}),
}));

const mockCache: Record<string, any> = {};

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: (_db: any, ...path: string[]) => ({ path: path.join('/') }),
  setDoc: vi.fn(async (ref: any, data: any) => { mockCache[ref.path] = data; }),
  getDoc: vi.fn(async (ref: any) => {
    const data = mockCache[ref.path];
    return { exists: () => !!data, data: () => data };
  }),
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  onAuthStateChanged: () => {},
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(() => Promise.resolve(null)),
  signOut: vi.fn(),
  GithubAuthProvider: vi.fn(),
  GoogleAuthProvider: vi.fn(),
}));

// ─── Tests ───

describe('generateAudioScript()', () => {
  it('strips bold markdown syntax', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const result = generateAudioScript('This is **bold** text');
    expect(result).toContain('bold');
    expect(result).not.toContain('**');
  });

  it('strips italic syntax', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const result = generateAudioScript('This is *italic* text');
    expect(result).not.toContain('*italic*');
    expect(result).toContain('italic');
  });

  it('converts h1 to spoken heading', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const result = generateAudioScript('# My Title');
    expect(result).toContain('My Title');
    expect(result).not.toContain('# ');
  });

  it('converts h2 to spoken section', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const result = generateAudioScript('## Section Name');
    expect(result).toContain('Section Name');
    expect(result).not.toContain('## ');
  });

  it('describes a mermaid code block', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const md = '```mermaid\ngraph TD\n    A[Start] --> B[End]\n```';
    const result = generateAudioScript(md);
    expect(result.toLowerCase()).toContain('diagram');
    expect(result).not.toContain('```');
  });

  it('describes a generic code block with language', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const md = '```javascript\nconsole.log("hello");\n```';
    const result = generateAudioScript(md);
    expect(result.toLowerCase()).toContain('javascript');
    expect(result).not.toContain('```');
    expect(result).not.toContain('console.log');
  });

  it('handles empty content', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const result = generateAudioScript('');
    expect(typeof result).toBe('string');
  });

  it('summarizes bullet lists longer than 5 items', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const md = `- Item 1\n- Item 2\n- Item 3\n- Item 4\n- Item 5\n- Item 6\n- Item 7`;
    const result = generateAudioScript(md);
    expect(result).toContain('more');
  });

  it('strips inline backtick code', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const result = generateAudioScript('Call the `doSomething()` function');
    expect(result).not.toContain('`');
    expect(result).toContain('doSomething');
  });

  it('strips strikethrough', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const result = generateAudioScript('~~old text~~');
    expect(result).not.toContain('~~');
  });
});

describe('describeDiagram()', () => {
  it('describes a simple flowchart', async () => {
    const { describeDiagram } = await import('../src/lib/audio');
    const code = 'graph TD\n    A[Start] --> B[End]';
    const result = describeDiagram('mermaid', code);
    expect(result.toLowerCase()).toContain('flowchart');
    expect(result).toContain('Start');
    expect(result).toContain('End');
  });

  it('describes a sequence diagram', async () => {
    const { describeDiagram } = await import('../src/lib/audio');
    const code = 'sequenceDiagram\n    Alice->>Bob: Hello';
    const result = describeDiagram('mermaid', code);
    expect(result.toLowerCase()).toContain('sequence');
    expect(result).toContain('Alice');
    expect(result).toContain('Bob');
  });

  it('describes a pie chart', async () => {
    const { describeDiagram } = await import('../src/lib/audio');
    const code = 'pie title Sales\n    "Chrome" : 65\n    "Firefox" : 35';
    const result = describeDiagram('mermaid', code);
    expect(result.toLowerCase()).toContain('pie');
    expect(result).toContain('Chrome');
  });

  it('describes graphviz diagrams generically', async () => {
    const { describeDiagram } = await import('../src/lib/audio');
    const code = 'digraph G { A -> B }';
    const result = describeDiagram('graphviz', code);
    expect(result.toLowerCase()).toContain('diagram');
  });

  it('describes nomnoml diagrams generically', async () => {
    const { describeDiagram } = await import('../src/lib/audio');
    const result = describeDiagram('nomnoml', '[A] -> [B]');
    expect(result.toLowerCase()).toContain('diagram');
  });
});

describe('isCacheValid()', () => {
  it('returns true when checksum and version match', async () => {
    const { isCacheValid } = await import('../src/lib/audio');
    const cache = {
      checksum: 'abc123',
      script: 'text',
      generatedAt: Date.now(),
      generatedBy: 'u1',
      generatorVersion: AUDIO_GENERATOR_VERSION,
    };
    expect(isCacheValid(cache, 'abc123')).toBe(true);
  });

  it('returns false when checksum differs', async () => {
    const { isCacheValid } = await import('../src/lib/audio');
    const cache = {
      checksum: 'abc123',
      script: 'text',
      generatedAt: Date.now(),
      generatedBy: 'u1',
      generatorVersion: AUDIO_GENERATOR_VERSION,
    };
    expect(isCacheValid(cache, 'different')).toBe(false);
  });

  it('returns false when generatorVersion differs', async () => {
    const { isCacheValid } = await import('../src/lib/audio');
    const cache = {
      checksum: 'abc',
      script: 'text',
      generatedAt: Date.now(),
      generatedBy: 'u1',
      generatorVersion: AUDIO_GENERATOR_VERSION + 1,
    };
    expect(isCacheValid(cache, 'abc')).toBe(false);
  });

  it('returns false for null cache', async () => {
    const { isCacheValid } = await import('../src/lib/audio');
    expect(isCacheValid(null, 'abc')).toBe(false);
  });
});

describe('loadAudioCache() / saveAudioCache()', () => {
  beforeEach(() => {
    Object.keys(mockCache).forEach(k => delete mockCache[k]);
  });

  it('returns null when no cache exists', async () => {
    const { loadAudioCache } = await import('../src/lib/audio');
    const result = await loadAudioCache('nonexistent-checksum');
    expect(result).toBeNull();
  });

  it('saves and loads audio cache by checksum', async () => {
    const { saveAudioCache, loadAudioCache } = await import('../src/lib/audio');
    await saveAudioCache('chk-abc', 'narration script here', 'uid-1');
    const loaded = await loadAudioCache('chk-abc');
    expect(loaded).not.toBeNull();
    expect(loaded!.script).toBe('narration script here');
    expect(loaded!.checksum).toBe('chk-abc');
    expect(loaded!.generatorVersion).toBe(AUDIO_GENERATOR_VERSION);
  });
});
