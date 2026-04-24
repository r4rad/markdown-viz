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

// Extract first meaningful sentence. Avoids splitting on abbreviations and
// version numbers by requiring the next character after . to be uppercase or end.
function firstSentence(text: string): string {
  const t = cleanInline(text.trim());
  // Sentence ends at ./?/! not followed immediately by a lowercase letter or digit
  const m = t.match(/^.+?[.!?](?!\s*[a-z0-9])/);
  if (m) return m[0].trim();
  if (t.length <= 160) return t;
  const cut = t.lastIndexOf(' ', 160);
  return t.slice(0, cut > 0 ? cut : 160) + '.';
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

function summarizeBullets(bullets: string[]): string {
  if (!bullets.length) return '';
  if (bullets.length === 1) return `This includes ${bullets[0]}.`;
  if (bullets.length <= 3) return `This covers ${bullets.join(', ')}.`;
  if (bullets.length <= 7) {
    return `This covers ${bullets.length} items including ${bullets.slice(0, 3).join(', ')}, and more.`;
  }
  return `This covers ${bullets.length} items.`;
}

function sectionNarrative(section: DocSection): string {
  const parts: string[] = [];

  if (section.content) {
    const sentence = firstSentence(section.content);
    if (sentence) parts.push(sentence);
  }

  if (section.bullets.length) {
    parts.push(summarizeBullets(section.bullets));
  }

  for (const d of section.diagrams) {
    parts.push(describeDiagram(d.lang, d.code));
  }

  if (section.codeBlocks.length === 1) {
    parts.push(`There is a ${section.codeBlocks[0]} code example.`);
  } else if (section.codeBlocks.length > 1) {
    parts.push(`There are ${section.codeBlocks.length} code examples.`);
  }

  return parts.join(' ');
}

// ─── Main script generator ────────────────────────────────────────────────────

export function generateAudioScript(content: string): string {
  if (!content.trim()) return '';

  const doc = parseDocument(content);
  const parts: string[] = [];

  if (doc.title) parts.push(doc.title + '.');

  if (doc.intro) {
    const sentence = firstSentence(doc.intro);
    if (sentence) parts.push(sentence);
  }

  // No sections: handle root-level content
  if (!doc.sections.length) {
    if (doc.rootBullets.length) parts.push(summarizeBullets(doc.rootBullets));
    for (const d of doc.rootDiagrams) parts.push(describeDiagram(d.lang, d.code));
    if (doc.rootCodeBlocks.length === 1) {
      parts.push(`There is a ${doc.rootCodeBlocks[0]} code example.`);
    } else if (doc.rootCodeBlocks.length > 1) {
      parts.push(`There are ${doc.rootCodeBlocks.length} code examples.`);
    }
    if (!parts.length) {
      // Pure paragraphs with no title or structure
      const cleaned = cleanInline(content.replace(/```[\s\S]*?```/g, ''));
      const sentences = cleaned
        .split(/(?<=[.!?])\s+(?=[A-Z])/)
        .map(s => s.trim())
        .filter(s => s.length > 20)
        .slice(0, 4);
      return sentences.join(' ');
    }
    return parts.join(' ');
  }

  // Section overview (only when 2+ H2 sections)
  const h2s = doc.sections.filter(s => s.level === 2);
  if (h2s.length >= 2) {
    const names = h2s.map(s => s.heading);
    const last = names[names.length - 1];
    const rest = names.slice(0, -1).join(', ');
    parts.push(`It covers ${rest}, and ${last}.`);
  }

  // Per-section narrative with hard word cap
  let wordCount = parts.join(' ').split(/\s+/).length;
  for (const section of doc.sections) {
    if (wordCount >= 400) break;
    const narrative = sectionNarrative(section);
    const line = narrative
      ? `${section.heading}: ${narrative}`
      : `${section.heading}.`;
    parts.push(line);
    wordCount += line.split(/\s+/).length;
  }

  // Root-level diagrams after sections
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

let cachedVoice: SpeechSynthesisVoice | null = null;

export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter(v => v.lang.startsWith('en'));
  const pool = english.length ? english : voices;

  const priority: Array<(v: SpeechSynthesisVoice) => boolean> = [
    v => /Google.*English.*Female/i.test(v.name),
    v => /Google.*English/i.test(v.name),
    v => /Microsoft.*(Natural|Neural|Online)/i.test(v.name) && v.lang.startsWith('en'),
    v => /Microsoft/i.test(v.name) && v.lang.startsWith('en'),
    v => v.lang === 'en-US',
    v => v.lang.startsWith('en'),
  ];

  for (const test of priority) {
    const match = pool.find(test);
    if (match) return match;
  }
  return pool[0] ?? null;
}

/** Call once at app startup to trigger browser voice loading. */
export function preloadVoices(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const tryCache = () => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) { cachedVoice = pickVoice(voices); return true; }
    return false;
  };
  if (!tryCache()) {
    const handler = () => {
      tryCache();
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
    };
    window.speechSynthesis.addEventListener('voiceschanged', handler);
  }
}

// ─── Playback ─────────────────────────────────────────────────────────────────

export type AudioState = 'playing' | 'paused' | 'stopped';

let activeUtterance: SpeechSynthesisUtterance | null = null;

export function playAudioScript(
  script: string,
  onState: (state: AudioState) => void,
): { pause: () => void; resume: () => void; stop: () => void } {
  if (activeUtterance) {
    window.speechSynthesis.cancel();
    activeUtterance = null;
  }

  const utterance = new SpeechSynthesisUtterance(script);
  utterance.rate = 0.92;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Use cached voice, or try picking one right now as fallback
  const voice = cachedVoice ?? pickVoice(window.speechSynthesis.getVoices());
  if (voice) utterance.voice = voice;

  activeUtterance = utterance;

  utterance.onstart = () => onState('playing');
  utterance.onpause = () => onState('paused');
  utterance.onresume = () => onState('playing');
  utterance.onend = () => { activeUtterance = null; onState('stopped'); };
  utterance.onerror = () => { activeUtterance = null; onState('stopped'); };

  window.speechSynthesis.speak(utterance);

  return {
    pause: () => window.speechSynthesis.pause(),
    resume: () => window.speechSynthesis.resume(),
    stop: () => {
      window.speechSynthesis.cancel();
      activeUtterance = null;
      onState('stopped');
    },
  };
}

