// TTS via Web Speech API — zero latency, no model download, no external API.
// Uses the best available neural voice on the device (Microsoft Neural on Windows,
// Google voices on Chrome, built-in voices on macOS/iOS).
// Pause/resume is implemented as cancel+restart from saved chunk index because
// speechSynthesis.pause() is unreliable in Chrome.

import { sanitizeForSpeech } from './audio';

const SPEECH_CHUNK_CHARS = 200;
// Chrome kills utterances at ~15 s — hard limit to guarantee no cutoff
const HARD_CHUNK_LIMIT = 200;
// Keep Chrome's speech engine alive during long pauses between chunks
const KEEPALIVE_INTERVAL_MS = 10_000;

export interface AudioControls {
  pause: () => void;
  resume: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setVolume: (vol: number) => void; // 0..1
}

export interface PlaybackCallbacks {
  onProgress: (currentSec: number, durationSec: number) => void;
  onEnded: () => void;
  onError: (msg: string) => void;
}

// ─── Voice selection ──────────────────────────────────────────────────────────

function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = voices.filter(v => v.lang.startsWith('en'));
  // Tier 1: Windows neural voices ("Microsoft Aria Online (Natural) - English (United States)")
  const neural = en.find(v => /(online|natural|neural)/i.test(v.name) && /en.US/i.test(v.lang));
  if (neural) return neural;
  // Tier 2: Any Windows neural voice in any en locale
  const anyNeural = en.find(v => /(online|natural|neural)/i.test(v.name));
  if (anyNeural) return anyNeural;
  // Tier 3: Google en-US (Chrome on non-Windows — decent quality)
  const googleUS = en.find(v => /google/i.test(v.name) && v.lang === 'en-US');
  if (googleUS) return googleUS;
  // Tier 4: Any en-US
  const usEn = en.find(v => v.lang === 'en-US');
  if (usEn) return usEn;
  return en[0] ?? null;
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) return Promise.resolve(voices);
  return new Promise(resolve => {
    const cb = () => { resolve(window.speechSynthesis.getVoices()); };
    window.speechSynthesis.addEventListener('voiceschanged', cb, { once: true });
    setTimeout(() => { resolve(window.speechSynthesis.getVoices()); }, 500);
  });
}

// ─── Sentence-boundary chunking ───────────────────────────────────────────────

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace + capital / quote
  const raw = text.split(/(?<=[.!?])\s+(?=[A-Z"'])/);
  const result: string[] = [];
  for (const sentence of raw) {
    if (sentence.length <= HARD_CHUNK_LIMIT) {
      result.push(sentence);
    } else {
      // Hard fallback: split long sentence by character limit at word boundary
      let rem = sentence;
      while (rem.length > HARD_CHUNK_LIMIT) {
        let cut = HARD_CHUNK_LIMIT;
        while (cut > 0 && rem[cut] !== ' ') cut--;
        if (cut === 0) cut = HARD_CHUNK_LIMIT;
        result.push(rem.slice(0, cut).trim());
        rem = rem.slice(cut).trim();
      }
      if (rem) result.push(rem);
    }
  }
  return result.filter(Boolean);
}

// ─── Synthesis + playback ─────────────────────────────────────────────────────

export async function synthesizeAndPlay(
  script: string,
  callbacks: PlaybackCallbacks,
): Promise<AudioControls> {
  window.speechSynthesis.cancel();

  const voices = await loadVoices();
  const voice = pickBestVoice(voices);

  const cleanScript = sanitizeForSpeech(script);
  const chunks = splitSentences(cleanScript).filter(c => c.trim().length > 0);
  if (!chunks.length) {
    callbacks.onError('No speakable content');
    throw new Error('No speakable content after sanitization');
  }

  const wordCount = cleanScript.trim().split(/\s+/).filter(Boolean).length;
  // Estimate duration at ~130 wpm (rate 0.9)
  const totalDuration = (wordCount / 130) * 60;

  let chunkIdx = 0;
  let stopped = false;
  let userPaused = false;
  let startTime = Date.now();
  let elapsedAtPause = 0;
  let volume = 1.0;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  function clearKeepalive(): void {
    if (keepaliveTimer !== null) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
  }

  function startKeepalive(): void {
    clearKeepalive();
    keepaliveTimer = setInterval(() => {
      if (stopped || userPaused) return;
      // Tickle Chrome's speech engine to prevent it from silently dying
      window.speechSynthesis.pause();
      setTimeout(() => { if (!stopped && !userPaused) window.speechSynthesis.resume(); }, 50);
    }, KEEPALIVE_INTERVAL_MS);
  }

  function speakFrom(idx: number): void {
    chunkIdx = idx;
    if (stopped || chunkIdx >= chunks.length) {
      clearKeepalive();
      if (!stopped) callbacks.onEnded();
      return;
    }

    const utt = new SpeechSynthesisUtterance(chunks[chunkIdx]);
    if (voice) utt.voice = voice;
    utt.rate = 0.9;
    utt.pitch = 1.0;
    utt.volume = volume;
    let retried = false;

    if (chunkIdx === 0) {
      utt.onstart = () => {
        startTime = Date.now();
        startKeepalive();
        callbacks.onProgress(0, totalDuration);
      };
    }

    utt.onboundary = () => {
      if (userPaused || stopped) return;
      const elapsed = elapsedAtPause + (Date.now() - startTime) / 1000;
      callbacks.onProgress(Math.min(elapsed, totalDuration - 0.1), totalDuration);
    };

    utt.onend = () => {
      retried = false;
      if (stopped || userPaused) return;
      speakFrom(chunkIdx + 1);
    };

    utt.onerror = (e) => {
      if (stopped || e.error === 'canceled' || e.error === 'interrupted') return;
      if (e.error === 'synthesis-failed' && !retried) {
        retried = true;
        setTimeout(() => {
          if (!stopped && !userPaused) speakFrom(chunkIdx);
        }, 300);
        return;
      }
      clearKeepalive();
      callbacks.onError(e.error || 'Speech error');
    };

    window.speechSynthesis.speak(utt);
  }

  speakFrom(0);

  return {
    pause: () => {
      if (!userPaused && !stopped) {
        userPaused = true;
        elapsedAtPause += (Date.now() - startTime) / 1000;
        clearKeepalive();
        window.speechSynthesis.cancel(); // cancel+restart is more reliable than pause
      }
    },
    resume: () => {
      if (userPaused && !stopped) {
        userPaused = false;
        startTime = Date.now();
        speakFrom(chunkIdx); // restart from the last chunk
      }
    },
    stop: () => {
      stopped = true;
      clearKeepalive();
      window.speechSynthesis.cancel();
      callbacks.onEnded();
    },
    seek: () => { /* Web Speech API does not support seeking */ },
    setVolume: (vol) => {
      volume = Math.max(0, Math.min(1, vol));
    },
  };
}

// Re-export chunk size for tests
export { SPEECH_CHUNK_CHARS };
