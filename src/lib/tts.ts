// TTS runtime adapter: Kokoro Web Worker management + HTMLAudioElement playback.
// Pure text generation lives in audio.ts; this file handles browser APIs.

export type KokoroStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SynthesisCallbacks {
  onModelProgress?: (pct: number) => void;
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

// ─── Worker state ─────────────────────────────────────────────────────────────

let worker: Worker | null = null;
let workerStatus: KokoroStatus = 'idle';

type InitResolve = () => void;
type InitReject = (err: Error) => void;
let pendingInit: { resolve: InitResolve; reject: InitReject } | null = null;
let initProgressCb: ((pct: number) => void) | undefined;

type SynthResolve = (v: { audio: Float32Array; sampleRate: number }) => void;
type SynthReject = (err: Error) => void;
let pendingSynth: { resolve: SynthResolve; reject: SynthReject } | null = null;

function getOrCreateWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/audio-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = handleWorkerMessage;
    worker.onerror = (e) => {
      const err = new Error(e.message || 'Worker error');
      workerStatus = 'error';
      pendingInit?.reject(err);
      pendingInit = null;
      pendingSynth?.reject(err);
      pendingSynth = null;
    };
  }
  return worker;
}

function handleWorkerMessage(e: MessageEvent): void {
  const msg = e.data;

  switch (msg.type) {
    case 'INIT_PROGRESS':
      initProgressCb?.(msg.progress as number);
      break;

    case 'INIT_DONE':
      workerStatus = 'ready';
      pendingInit?.resolve();
      pendingInit = null;
      break;

    case 'INIT_ERROR':
      workerStatus = 'error';
      pendingInit?.reject(new Error(msg.error as string));
      pendingInit = null;
      break;

    case 'SYNTHESIS_DONE': {
      const audio = new Float32Array(msg.audio as ArrayBuffer);
      pendingSynth?.resolve({ audio, sampleRate: msg.sampleRate as number });
      pendingSynth = null;
      break;
    }

    case 'SYNTHESIS_ERROR':
      pendingSynth?.reject(new Error(msg.error as string));
      pendingSynth = null;
      break;
  }
}

/** Initialize the Kokoro model in the Worker (no-op if already loaded). */
export async function initKokoro(onProgress?: (pct: number) => void): Promise<void> {
  if (workerStatus === 'ready') return;
  if (workerStatus === 'loading') {
    // Attach to the already-running init
    initProgressCb = onProgress;
    return new Promise<void>((resolve, reject) => {
      pendingInit = { resolve, reject };
    });
  }

  workerStatus = 'loading';
  initProgressCb = onProgress;
  const w = getOrCreateWorker();

  return new Promise<void>((resolve, reject) => {
    pendingInit = { resolve, reject };
    w.postMessage({ type: 'INIT' });
  });
}

/** Synthesize text to audio using the Kokoro Worker. */
export async function synthesizeAudio(
  text: string,
  callbacks?: SynthesisCallbacks,
): Promise<{ audio: Float32Array; sampleRate: number }> {
  if (workerStatus !== 'ready') {
    await initKokoro(callbacks?.onModelProgress);
  }

  callbacks?.onGenerating?.();

  const w = getOrCreateWorker();
  const id = Math.random().toString(36).slice(2);

  return new Promise<{ audio: Float32Array; sampleRate: number }>((resolve, reject) => {
    pendingSynth = { resolve, reject };
    w.postMessage({ type: 'SYNTHESIZE', text, id });
  });
}

export function getKokoroStatus(): KokoroStatus {
  return workerStatus;
}

// ─── Playback via HTMLAudioElement ───────────────────────────────────────────

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

/**
 * Play a WAV ArrayBuffer via an HTMLAudioElement and return playback controls.
 * Stops any currently playing audio first.
 */
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
