import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { getApp } from 'firebase/app';
import { AudioCache, AUDIO_GENERATOR_VERSION } from '../types';

// ─── Diagram description ─────────────────────────────────────────────────────

export function describeDiagram(lang: string, code: string): string {
  const l = lang.toLowerCase().trim();

  if (l === 'mermaid') {
    const trimmed = code.trim();

    if (/^(graph|flowchart)\s/i.test(trimmed)) {
      const arrows = trimmed.match(/\[([^\]]+)\]/g) ?? [];
      const labels = arrows.map(a => a.replace(/\[|\]/g, ''));
      const unique = [...new Set(labels)];
      if (unique.length >= 2) {
        return `Flowchart diagram showing: ${unique.slice(0, 6).join(', ')}.`;
      }
      return 'Flowchart diagram.';
    }

    if (/^sequenceDiagram/i.test(trimmed)) {
      const participants = new Set<string>();
      for (const m of trimmed.matchAll(/^[\s]*([A-Za-z0-9_]+)\s*[-]>+\s*([A-Za-z0-9_]+)/gm)) {
        participants.add(m[1]);
        participants.add(m[2]);
      }
      const actors = [...participants];
      if (actors.length >= 2) {
        return `Sequence diagram showing interactions between: ${actors.join(', ')}.`;
      }
      return 'Sequence diagram.';
    }

    if (/^pie/i.test(trimmed)) {
      const titleMatch = trimmed.match(/title\s+(.+)/i);
      const segments = [...trimmed.matchAll(/"([^"]+)"\s*:\s*(\d+)/g)]
        .map(m => `${m[1]} at ${m[2]}`);
      const title = titleMatch ? titleMatch[1] : 'data';
      if (segments.length) {
        return `Pie chart for ${title}: ${segments.slice(0, 5).join(', ')}.`;
      }
      return `Pie chart for ${title}.`;
    }

    if (/^classDiagram/i.test(trimmed)) {
      const classes = [...trimmed.matchAll(/class\s+([A-Za-z0-9_]+)/g)].map(m => m[1]);
      if (classes.length) {
        return `Class diagram with classes: ${[...new Set(classes)].slice(0, 6).join(', ')}.`;
      }
      return 'Class diagram.';
    }

    if (/^gantt/i.test(trimmed)) {
      const titleMatch = trimmed.match(/title\s+(.+)/i);
      const title = titleMatch ? titleMatch[1] : 'project';
      return `Gantt chart for ${title}.`;
    }

    return 'Mermaid diagram.';
  }

  return `${lang} diagram.`;
}

// ─── Inline markdown cleaner ──────────────────────────────────────────────────

function cleanInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => (alt ? alt : ''))
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
}

function wordsIn(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ─── Document structure ───────────────────────────────────────────────────────

interface DiagramBlock { lang: string; code: string; }

interface DocSection {
  heading: string;
  level: number;
  content: string;
  bullets: string[];
  diagrams: DiagramBlock[];
  codeBlocks: string[];
}

interface ParsedDoc {
  title: string;
  intro: string;
  rootBullets: string[];
  rootDiagrams: DiagramBlock[];
  rootCodeBlocks: string[];
  sections: DocSection[];
}

function parseDocument(content: string): ParsedDoc {
  const lines = content.split('\n');
  let title = '';
  let intro = '';
  const rootBullets: string[] = [];
  const rootDiagrams: DiagramBlock[] = [];
  const rootCodeBlocks: string[] = [];
  const sections: DocSection[] = [];
  let current: DocSection | null = null;
  let inFence = false;
  let fenceLang = '';
  const fenceLines: string[] = [];

  const flushFence = () => {
    const code = fenceLines.join('\n');
    const isDiagram = /^(mermaid|graphviz|plantuml|nomnoml|flowchart)$/i.test(fenceLang);
    if (isDiagram) {
      (current ? current.diagrams : rootDiagrams).push({ lang: fenceLang, code });
    } else {
      (current ? current.codeBlocks : rootCodeBlocks).push(fenceLang || 'code');
    }
    fenceLines.length = 0;
    fenceLang = '';
  };

  for (const line of lines) {
    if (line.match(/^```/)) {
      if (inFence) { flushFence(); inFence = false; }
      else { fenceLang = line.slice(3).trim(); inFence = true; }
      continue;
    }
    if (inFence) { fenceLines.push(line); continue; }

    if (!line.trim() || /^[-*_]{3,}$/.test(line.trim()) || /^<!--/.test(line)) continue;

    const h1 = line.match(/^# (.+)/);
    if (h1) { if (!title) title = cleanInline(h1[1]); continue; }

    const hN = line.match(/^(#{2,6}) (.+)/);
    if (hN) {
      current = {
        heading: cleanInline(hN[2].trim()),
        level: hN[1].length,
        content: '',
        bullets: [],
        diagrams: [],
        codeBlocks: [],
      };
      sections.push(current);
      continue;
    }

    // Task list and regular bullets/numbered
    const bulletMatch =
      line.match(/^[-*+]\s+\[[ xX]\]\s+(.+)/) ||
      line.match(/^[-*+]\s+(.+)/) ||
      line.match(/^\d+\.\s+(.+)/);
    if (bulletMatch) {
      const item = cleanInline(bulletMatch[1]);
      if (current) current.bullets.push(item);
      else rootBullets.push(item);
      continue;
    }

    const bq = line.match(/^>\s*(.*)/);
    const textLine = cleanInline(bq ? bq[1] : line);
    if (!textLine) continue;

    if (!current) intro += (intro ? ' ' : '') + textLine;
    else current.content += (current.content ? ' ' : '') + textLine;
  }

  return { title, intro, rootBullets, rootDiagrams, rootCodeBlocks, sections };
}

// ─── Section content summarizer ───────────────────────────────────────────────

/**
 * Build a natural-language narrative for one section within a word budget.
 * Extracts multiple sentences from prose content, lists bullets naturally,
 * and describes diagrams.
 */
function sectionNarrative(section: DocSection, wordBudget: number): string {
  const parts: string[] = [];
  let used = 0;

  // Extract sentences from prose content (up to 70% of budget)
  if (section.content) {
    const sentences = splitSentences(section.content);
    const contentBudget = Math.floor(wordBudget * 0.7);
    for (const s of sentences) {
      const w = wordsIn(s);
      if (used + w > contentBudget && used > 0) break;
      parts.push(s);
      used += w;
    }
  }

  // List bullets naturally (not just "X items")
  if (section.bullets.length && used < wordBudget) {
    const maxBullets = Math.max(3, Math.floor((wordBudget - used) / 5));
    const shown = section.bullets.slice(0, maxBullets);
    const overflow = section.bullets.length - shown.length;
    let bulletText: string;
    if (shown.length === 1) {
      bulletText = `This includes ${shown[0]}.`;
    } else if (overflow > 0) {
      bulletText = `Key points include ${shown.slice(0, -1).join(', ')}, ${shown[shown.length - 1]}, and ${overflow} more.`;
    } else {
      bulletText = `Key points include ${shown.slice(0, -1).join(', ')}, and ${shown[shown.length - 1]}.`;
    }
    const w = wordsIn(bulletText);
    if (used + w <= wordBudget + 15) {
      parts.push(bulletText);
      used += w;
    }
  }

  for (const d of section.diagrams) {
    const desc = describeDiagram(d.lang, d.code);
    parts.push(desc);
  }

  if (section.codeBlocks.length === 1) {
    parts.push(`There is a ${section.codeBlocks[0]} code example.`);
  } else if (section.codeBlocks.length > 1) {
    parts.push(`There are ${section.codeBlocks.length} code examples.`);
  }

  return parts.join(' ');
}

// ─── Main script generator ────────────────────────────────────────────────────

const TARGET_WORDS = 550; // ~3.5 min at 150 wpm

export function generateAudioScript(content: string): string {
  if (!content.trim()) return '';

  const doc = parseDocument(content);
  const parts: string[] = [];

  if (doc.title) parts.push(`${doc.title}.`);

  // Include up to 3 intro sentences
  if (doc.intro) {
    const sentences = splitSentences(doc.intro).slice(0, 3);
    if (sentences.length) parts.push(sentences.join(' '));
  }

  // Flat docs (no sections)
  if (!doc.sections.length) {
    if (doc.rootBullets.length) {
      const shown = doc.rootBullets.slice(0, 8);
      const overflow = doc.rootBullets.length - shown.length;
      const joined = shown.slice(0, -1).join(', ') + (shown.length > 1 ? `, and ${shown[shown.length - 1]}` : shown[0]);
      parts.push(overflow > 0
        ? `Key points include ${joined}, and ${overflow} more.`
        : `Key points include ${joined}.`);
    }
    for (const d of doc.rootDiagrams) parts.push(describeDiagram(d.lang, d.code));
    if (!parts.length || (parts.length === 1 && doc.title)) {
      // Pure prose — extract sentences up to target
      const cleaned = cleanInline(content.replace(/```[\s\S]*?```/g, ''));
      const sentences = splitSentences(cleaned);
      let words = 0;
      const out: string[] = [];
      for (const s of sentences) {
        const w = wordsIn(s);
        if (words + w > TARGET_WORDS) break;
        out.push(s);
        words += w;
      }
      return out.join(' ');
    }
    return parts.join(' ');
  }

  // Distribute word budget evenly across all sections.
  // No "It covers X, Y, Z" list — that sounds like a table of contents.
  const headerWords = wordsIn(parts.join(' '));
  const remaining = Math.max(TARGET_WORDS - headerWords, 100);
  const perSection = Math.max(30, Math.floor(remaining / doc.sections.length));

  for (const section of doc.sections) {
    const narrative = sectionNarrative(section, perSection);
    const line = narrative
      ? `${section.heading}. ${narrative}`
      : `${section.heading}.`;
    parts.push(line);
  }

  for (const d of doc.rootDiagrams) parts.push(describeDiagram(d.lang, d.code));

  return parts.join(' ');
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

export function isCacheValid(cache: AudioCache | null, checksum: string): boolean {
  if (!cache) return false;
  return cache.checksum === checksum && cache.generatorVersion === AUDIO_GENERATOR_VERSION;
}

export async function loadAudioCache(checksum: string): Promise<AudioCache | null> {
  const db = getFirestore(getApp());
  const ref = doc(db, 'audioCache', checksum);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as AudioCache;
}

export async function saveAudioCache(
  checksum: string,
  script: string,
  userId: string,
): Promise<void> {
  const db = getFirestore(getApp());
  const ref = doc(db, 'audioCache', checksum);
  const entry: AudioCache = {
    checksum,
    script,
    generatedAt: Date.now(),
    generatedBy: userId,
    generatorVersion: AUDIO_GENERATOR_VERSION,
  };
  await setDoc(ref, entry);
}

// ─── Voice selection ──────────────────────────────────────────────────────────

// (Removed: pickVoice, preloadVoices — replaced by Kokoro neural TTS in tts.ts)

// ─── WAV encoding ─────────────────────────────────────────────────────────────

/** Convert a mono Float32Array PCM signal to a WAV ArrayBuffer (16-bit PCM). */
export function float32ToWav(audio: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const dataSize = audio.length * 2; // 2 bytes per 16-bit sample
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);                                       // Subchunk1Size (PCM)
  view.setUint16(20, 1, true);                                         // AudioFormat (PCM = 1)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true); // ByteRate
  view.setUint16(32, numChannels * bitsPerSample / 8, true);           // BlockAlign
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < audio.length; i++) {
    const s = Math.max(-1, Math.min(1, audio[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    off += 2;
  }
  return buffer;
}

// ─── IndexedDB audio cache (WAV bytes, max 5 entries) ────────────────────────

export const TTS_VOICE = 'hf-mms';
export const TTS_CACHE_VERSION = 2;
const MAX_AUDIO_CACHE = 5;
const AUDIO_MANIFEST_KEY = `audio-manifest-v${TTS_CACHE_VERSION}`;

export function audioCacheKey(checksum: string): string {
  return `tts-v${TTS_CACHE_VERSION}-${TTS_VOICE}-${checksum}`;
}

export async function loadCachedAudio(checksum: string): Promise<ArrayBuffer | null> {
  try {
    const { get } = await import('idb-keyval');
    const key = audioCacheKey(checksum);
    const buf = await get<ArrayBuffer>(key);
    return buf ?? null;
  } catch {
    return null;
  }
}

export async function cacheAudio(checksum: string, buffer: ArrayBuffer): Promise<void> {
  try {
    const { get, set, del } = await import('idb-keyval');
    const key = audioCacheKey(checksum);
    const manifest: string[] = (await get<string[]>(AUDIO_MANIFEST_KEY)) ?? [];

    // LRU eviction: remove oldest entry when at capacity
    if (manifest.length >= MAX_AUDIO_CACHE) {
      const oldest = manifest.shift()!;
      await del(oldest);
    }
    manifest.push(key);
    await set(AUDIO_MANIFEST_KEY, manifest);
    await set(key, buffer);
  } catch {
    // Cache write failing is non-fatal
  }
}

// ─── Playback ─────────────────────────────────────────────────────────────────

// (Removed: playAudioScript, AudioState — replaced by playWavBuffer in tts.ts)

// ─── Text chunking for TTS ────────────────────────────────────────────────────

/**
 * Split text into sentence-boundary chunks of at most maxChars each.
 * Chunks preserve order and are non-empty.
 */
export function splitIntoChunks(text: string, maxChars = 400): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|\S[^.!?\n]*$/g) ?? [text];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.length ? chunks : [text.slice(0, maxChars)];
}

