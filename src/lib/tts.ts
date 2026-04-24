// TTS via HuggingFace Inference API — server-side synthesis, no browser model download.
// Model: facebook/mms-tts-eng (VITS, CC-BY-NC 4.0 for non-commercial use)
// Audio is cached in IndexedDB after first synthesis; subsequent plays are instant.

import { splitIntoChunks } from './audio';

const HF_TTS_URL = 'https://api-inference.huggingface.co/models/facebook/mms-tts-eng';
const MAX_RETRIES = 3;
const CONCURRENCY = 3; // max parallel chunk requests to avoid rate-limiting

export interface SynthesisCallbacks {
  onGenerating?: () => void;
}

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

// ─── Internal helpers ─────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function callHfApi(
  text: string,
  signal: AbortSignal,
  attempt = 0,
): Promise<ArrayBuffer> {
  const resp = await fetch(HF_TTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: text }),
    signal,
  });

  if (resp.ok) return resp.arrayBuffer();

  // Model warming up — wait then retry
  if ((resp.status === 503 || resp.status === 500) && attempt < MAX_RETRIES) {
    const json: { estimated_time?: number } = await resp.json().catch(() => ({}));
    const wait = Math.min((json.estimated_time ?? 10) * 1000, 20_000);
    await sleep(wait);
    return callHfApi(text, signal, attempt + 1);
  }

  // Rate limited — back off then retry
  if (resp.status === 429 && attempt < MAX_RETRIES) {
    await sleep(5_000 * (attempt + 1));
    return callHfApi(text, signal, attempt + 1);
  }

  throw new Error(`TTS API ${resp.status}: ${resp.statusText}`);
}

/** Run tasks in order, at most `limit` at a time. Returns results in input order. */
async function poolAll<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// ─── Synthesis ────────────────────────────────────────────────────────────────

let currentAbort: AbortController | null = null;

export async function synthesizeAudio(
  text: string,
  callbacks?: SynthesisCallbacks,
): Promise<{ audio: Float32Array; sampleRate: number }> {
  // Cancel any previous in-flight synthesis
  currentAbort?.abort();
  const abort = new AbortController();
  currentAbort = abort;

  callbacks?.onGenerating?.();

  const chunks = splitIntoChunks(text);

  // Bounded parallel API calls — preserves chunk order
  const rawBuffers = await poolAll(
    chunks.map(c => () => callHfApi(c, abort.signal)),
    CONCURRENCY,
  );

  if (abort.signal.aborted) throw new DOMException('Synthesis cancelled', 'AbortError');

  // Decode all audio responses using a single Web Audio context
  const audioCtx = new AudioContext();
  let audioBuffers: AudioBuffer[];
  try {
    audioBuffers = await Promise.all(
      rawBuffers.map(b => audioCtx.decodeAudioData(b.slice(0))),
    );
  } finally {
    audioCtx.close().catch(() => undefined);
  }

  // Concatenate mono PCM (always channel 0 from a TTS model)
  const sampleRate = audioBuffers[0].sampleRate;
  const totalLength = audioBuffers.reduce((s, b) => s + b.length, 0);
  const audio = new Float32Array(totalLength);
  let offset = 0;
  for (const buf of audioBuffers) {
    audio.set(buf.getChannelData(0), offset);
    offset += buf.length;
  }

  return { audio, sampleRate };
}

// ─── Playback via HTMLAudioElement ────────────────────────────────────────────

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;

function releaseActiveAudio(): void {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = '';
    activeAudio = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}

export function playWavBuffer(
  buffer: ArrayBuffer,
  callbacks: PlaybackCallbacks,
): AudioControls {
  releaseActiveAudio();

  const blob = new Blob([buffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  activeObjectUrl = url;

  const audio = new Audio(url);
  activeAudio = audio;

  audio.ontimeupdate = () => {
    if (!isNaN(audio.duration)) {
      callbacks.onProgress(audio.currentTime, audio.duration);
    }
  };
  audio.onended = () => {
    releaseActiveAudio();
    callbacks.onEnded();
  };
  audio.onerror = () => {
    releaseActiveAudio();
    callbacks.onError('Playback error');
  };

  audio.play().catch((err: Error) => callbacks.onError(err.message));

  return {
    pause: () => audio.pause(),
    resume: () => { audio.play().catch((e: Error) => callbacks.onError(e.message)); },
    stop: () => { releaseActiveAudio(); callbacks.onEnded(); },
    seek: (sec: number) => { audio.currentTime = sec; },
    setVolume: (vol: number) => { audio.volume = Math.max(0, Math.min(1, vol)); },
  };
}

