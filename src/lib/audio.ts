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

  // generic fallback for graphviz, nomnoml, plantuml, etc.
  return `${lang} diagram.`;
}

// ─── Script generation ────────────────────────────────────────────────────────

export function generateAudioScript(content: string): string {
  if (!content.trim()) return '';

  const lines = content.split('\n');
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = line.match(/^```(\w*)/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || '';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const code = codeLines.join('\n');
      if (lang === 'mermaid' || lang === 'graphviz' || lang === 'nomnoml' || lang === 'plantuml') {
        output.push(describeDiagram(lang, code));
      } else {
        const langLabel = lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : 'Code';
        output.push(`${langLabel} code block.`);
      }
      continue;
    }

    // Headings
    const h1 = line.match(/^# (.+)/);
    if (h1) { output.push(h1[1].trim()); i++; continue; }

    const h2 = line.match(/^## (.+)/);
    if (h2) { output.push(`Section: ${h2[1].trim()}.`); i++; continue; }

    const h3 = line.match(/^#{3,} (.+)/);
    if (h3) { output.push(`Sub-section: ${h3[1].trim()}.`); i++; continue; }

    // Bullet list — collect and summarise if long
    if (/^[-*+] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+] /.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+] /, '').trim());
        i++;
      }
      if (items.length > 5) {
        const shown = items.slice(0, 5).join(', ');
        output.push(`List with ${items.length} items including: ${shown}, and ${items.length - 5} more.`);
      } else {
        output.push(items.join('. ') + '.');
      }
      continue;
    }

    // Numbered list
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, '').trim());
        i++;
      }
      output.push(items.join('. ') + '.');
      continue;
    }

    // Blank line separator — skip
    if (line.trim() === '') { i++; continue; }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) { i++; continue; }

    // Blockquote
    if (line.startsWith('> ')) {
      output.push(line.slice(2).trim());
      i++;
      continue;
    }

    // Regular paragraph text — clean formatting marks
    let text = line;
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => alt ? `Image: ${alt}.` : 'Image.');
    text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    text = text.replace(/~~([^~]+)~~/g, '$1');
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/_([^_]+)_/g, '$1');
    text = text.replace(/`([^`]+)`/g, '$1');
    text = text.trim();

    if (text) output.push(text);
    i++;
  }

  return output.join(' ');
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
    stop: () => { window.speechSynthesis.cancel(); activeUtterance = null; onState('stopped'); },
  };
}
