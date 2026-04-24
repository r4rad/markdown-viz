import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AUDIO_GENERATOR_VERSION } from '../src/types';

// ─── Mocks ───
vi.mock('firebase/app', () => ({
  getApps: () => [{}],
  getApp: () => ({}),
  initializeApp: () => ({}),
}));

vi.mock('idb-keyval', () => {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key))),
    set: vi.fn((key: string, val: unknown) => { store.set(key, val); return Promise.resolve(); }),
    del: vi.fn((key: string) => { store.delete(key); return Promise.resolve(); }),
    keys: vi.fn(() => Promise.resolve([...store.keys()])),
  };
});

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

describe('generateAudioScript() - summarized narrative', () => {
  it('opens with document title', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const md = '# Architecture Guide\nThis guide explains the system design for new engineers.';
    const result = generateAudioScript(md);
    expect(result).toMatch(/^Architecture Guide/);
    expect(result).toContain('system design');
  });

  it('provides section overview for multi-section documents', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const md = '# My Doc\nIntro.\n\n## Setup\nInstallation steps.\n\n## Usage\nHow to use.\n\n## Troubleshooting\nCommon issues.';
    const result = generateAudioScript(md);
    expect(result).toContain('Setup');
    expect(result).toContain('Usage');
    expect(result).toContain('Troubleshooting');
    expect(result.toLowerCase()).toMatch(/covers|sections/);
  });

  it('summarizes each section to its first sentence, not full content', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const md = '# API Docs\n\n## Authentication\nAll requests require a Bearer token. Tokens expire after 24 hours. Refresh tokens are available via the refresh endpoint.';
    const result = generateAudioScript(md);
    expect(result).toContain('Authentication');
    expect(result).toContain('Bearer token');
  });

  it('produces output shorter than a verbose multi-section input', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const section = (n: number) =>
      `## Section ${n}\nThis is the content of section ${n} with many details.\n` +
      Array.from({ length: 8 }, (_, i) => `- Detailed item ${i + 1} with explanation`).join('\n');
    const md =
      '# Long Document\nThis document covers many topics in depth.\n\n' +
      Array.from({ length: 6 }, (_, i) => section(i + 1)).join('\n\n');
    const outputWords = generateAudioScript(md).split(/\s+/).length;
    const inputWords = md.split(/\s+/).length;
    expect(outputWords).toBeLessThan(inputWords);
    expect(outputWords).toBeLessThanOrEqual(400);
  });

  it('strips all markdown formatting characters from output', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const md = '# Title\n## Section\n**bold** and *italic* and `code` and ~~strike~~';
    const result = generateAudioScript(md);
    expect(result).not.toContain('**');
    expect(result).not.toContain('~~');
    expect(result).not.toContain('`code`');
    expect(result).not.toContain('# ');
    expect(result).not.toContain('## ');
  });

  it('does not read code inside code blocks', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const md = '## Example\n```javascript\nconsole.log("hello");\nreturn 42;\n```';
    const result = generateAudioScript(md);
    expect(result).not.toContain('console.log');
    expect(result).not.toContain('return 42');
    expect(result.toLowerCase()).toMatch(/javascript|code/);
  });

  it('describes mermaid diagrams in natural language', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const md = '# API\n## Flow\n```mermaid\nsequenceDiagram\n    Client->>Server: Request\n    Server-->>Client: Response\n```';
    const result = generateAudioScript(md);
    expect(result.toLowerCase()).toContain('sequence');
    expect(result).not.toContain('```');
  });

  it('summarizes long bullet lists without reading each item', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const md = '## Features\n' + Array.from({ length: 8 }, (_, i) => `- Feature ${i + 1}`).join('\n');
    const result = generateAudioScript(md);
    expect(result).not.toMatch(/- Feature/);
    expect(result.toLowerCase()).toMatch(/items|features|covers/);
  });

  it('handles plain paragraphs with no headings', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    const md = 'This document explains the basics. It covers three topics. You will learn the fundamentals.';
    const result = generateAudioScript(md);
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toContain('#');
    expect(result).not.toContain('*');
  });

  it('handles empty content', async () => {
    const { generateAudioScript } = await import('../src/lib/audio');
    expect(generateAudioScript('')).toBe('');
    expect(generateAudioScript('   ')).toBe('');
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

describe('float32ToWav()', () => {
  it('produces a buffer starting with RIFF and WAVE markers', async () => {
    const { float32ToWav } = await import('../src/lib/audio');
    const audio = new Float32Array([0, 0.5, -0.5, 0]);
    const buf = float32ToWav(audio, 24000);
    const view = new DataView(buf);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe('WAVE');
  });

  it('has byte length of 44 + 2 bytes per sample', async () => {
    const { float32ToWav } = await import('../src/lib/audio');
    const audio = new Float32Array(100);
    const buf = float32ToWav(audio, 24000);
    expect(buf.byteLength).toBe(44 + 100 * 2);
  });

  it('encodes sample rate correctly at byte 24', async () => {
    const { float32ToWav } = await import('../src/lib/audio');
    const audio = new Float32Array(1);
    const buf = float32ToWav(audio, 22050);
    expect(new DataView(buf).getUint32(24, true)).toBe(22050);
  });

  it('clamps out-of-range float32 samples to int16 limits', async () => {
    const { float32ToWav } = await import('../src/lib/audio');
    const audio = new Float32Array([2.0, -2.0]);
    const buf = float32ToWav(audio, 24000);
    const view = new DataView(buf);
    expect(view.getInt16(44, true)).toBe(0x7FFF);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });
});

describe('audioCacheKey()', () => {
  it('returns a versioned, voice-prefixed key containing the checksum', async () => {
    const { audioCacheKey } = await import('../src/lib/audio');
    const key = audioCacheKey('sha256abc');
    expect(key).toMatch(/^tts-v\d+/);
    expect(key).toContain('sha256abc');
  });

  it('produces different keys for different checksums', async () => {
    const { audioCacheKey } = await import('../src/lib/audio');
    expect(audioCacheKey('aaa')).not.toBe(audioCacheKey('bbb'));
  });
});

// ─── splitIntoChunks() ───────────────────────────────────────────────────────

describe('splitIntoChunks()', () => {
  it('returns single chunk when text is shorter than maxChars', async () => {
    const { splitIntoChunks } = await import('../src/lib/audio');
    const result = splitIntoChunks('Hello world.', 400);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Hello world.');
  });

  it('splits on sentence boundaries when text exceeds maxChars', async () => {
    const { splitIntoChunks } = await import('../src/lib/audio');
    const long = 'First sentence. Second sentence. Third sentence.';
    const result = splitIntoChunks(long, 30);
    expect(result.length).toBeGreaterThan(1);
    result.forEach(chunk => expect(chunk.length).toBeLessThanOrEqual(50));
  });

  it('preserves all content across chunks (no text lost)', async () => {
    const { splitIntoChunks } = await import('../src/lib/audio');
    const text = 'One sentence here! Another follows. And a third.';
    const chunks = splitIntoChunks(text, 25);
    const rejoined = chunks.join(' ');
    // Every original sentence should appear somewhere in the output
    expect(rejoined).toContain('One sentence here');
    expect(rejoined).toContain('Another follows');
    expect(rejoined).toContain('And a third');
  });

  it('handles empty-ish text gracefully', async () => {
    const { splitIntoChunks } = await import('../src/lib/audio');
    const result = splitIntoChunks('', 400);
    expect(result).toHaveLength(1);
  });

  it('uses 400 char default limit', async () => {
    const { splitIntoChunks } = await import('../src/lib/audio');
    const text = 'Short text.';
    const result = splitIntoChunks(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Short text.');
  });
});
