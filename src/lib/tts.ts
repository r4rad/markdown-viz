// TTS via Web Speech API — zero latency, no model download, no external API.
// Uses the best available neural voice on the device (Microsoft Neural on Windows,
// Google voices on Chrome, built-in voices on macOS/iOS).
// Text is split into ~150-char chunks to avoid Chrome's 15-second utterance cutoff bug.

import { splitIntoChunks } from './audio';

const SPEECH_CHUNK_CHARS = 150; // safe for all browsers including Chrome

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

// ─── Synthesis + playback ─────────────────────────────────────────────────────

export async function synthesizeAndPlay(
  script: string,
  callbacks: PlaybackCallbacks,
): Promise<AudioControls> {
  window.speechSynthesis.cancel();

  const voices = await loadVoices();
  const voice = pickBestVoice(voices);

  const chunks = splitIntoChunks(script, SPEECH_CHUNK_CHARS);
  const wordCount = script.trim().split(/\s+/).filter(Boolean).length;
  // Estimate duration at ~130 wpm (rate 0.9)
  const totalDuration = (wordCount / 130) * 60;

  let chunkIdx = 0;
  let stopped = false;
  let paused = false;
  let startTime = 0;
  let elapsedAtPause = 0;
  let volume = 1.0;

  function speakNext(): void {
    if (stopped || chunkIdx >= chunks.length) {
      if (!stopped) callbacks.onEnded();
      return;
    }

    const utt = new SpeechSynthesisUtterance(chunks[chunkIdx]);
    if (voice) utt.voice = voice;
    utt.rate = 0.9;
    utt.pitch = 1.0;
    utt.volume = volume;

    if (chunkIdx === 0) {
      utt.onstart = () => {
        startTime = Date.now();
        callbacks.onProgress(0, totalDuration);
      };
    }

    utt.onboundary = () => {
      if (paused || stopped) return;
      const elapsed = elapsedAtPause + (Date.now() - startTime) / 1000;
      callbacks.onProgress(Math.min(elapsed, totalDuration - 0.1), totalDuration);
    };

    utt.onend = () => {
      if (stopped) return;
      chunkIdx++;
      speakNext();
    };

    utt.onerror = (e) => {
      if (stopped || e.error === 'canceled' || e.error === 'interrupted') return;
      callbacks.onError(e.error || 'Speech error');
    };

    window.speechSynthesis.speak(utt);
  }

  speakNext();

  return {
    pause: () => {
      if (!paused) {
        paused = true;
        elapsedAtPause += (Date.now() - startTime) / 1000;
        window.speechSynthesis.pause();
      }
    },
    resume: () => {
      if (paused) {
        paused = false;
        startTime = Date.now();
        window.speechSynthesis.resume();
      }
    },
    stop: () => {
      stopped = true;
      window.speechSynthesis.cancel();
      callbacks.onEnded();
    },
    seek: () => { /* Web Speech API does not support seeking */ },
    setVolume: (vol) => {
      volume = Math.max(0, Math.min(1, vol));
      // Applied to the next utterance chunk
    },
  };
}
