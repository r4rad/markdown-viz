import { icon } from './icons';

export type PlayerPhase =
  | 'hidden'
  | 'loading'    // model downloading/initialising
  | 'generating' // TTS synthesis in progress
  | 'playing'
  | 'paused'
  | 'error';

export interface AudioPlayerCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (vol: number) => void;
  onClose: () => void;
}

let playerEl: HTMLElement | null = null;
let callbacks: AudioPlayerCallbacks | null = null;
let phase: PlayerPhase = 'hidden';

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createAudioPlayer(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'audio-player';
  el.className = 'audio-player audio-player-hidden';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Audio player');

  el.innerHTML = `
    <div class="apl-header">
      <span class="apl-drag-handle" title="Drag to reposition">⠿</span>
      <span class="apl-title" id="apl-title">Listening…</span>
      <button class="apl-icon-btn" id="apl-close-btn" title="Close player">✕</button>
    </div>

    <div class="apl-status" id="apl-status">
      <span class="apl-status-text" id="apl-status-text">Loading model…</span>
      <div class="apl-loader-track">
        <div class="apl-loader-fill" id="apl-loader-fill"></div>
      </div>
    </div>

    <div class="apl-seek-row" id="apl-seek-row">
      <span class="apl-time" id="apl-time-cur">0:00</span>
      <input type="range" class="apl-seek-slider" id="apl-seek-slider"
             min="0" step="0.5" value="0" aria-label="Seek">
      <span class="apl-time" id="apl-time-dur">0:00</span>
    </div>

    <div class="apl-controls" id="apl-controls">
      <button class="apl-icon-btn" id="apl-rewind-btn" title="Back 10s">⏮</button>
      <button class="apl-icon-btn apl-play-pause-btn" id="apl-playpause-btn" title="Play / Pause">
        ${icon('play')}
      </button>
      <button class="apl-icon-btn" id="apl-fwd-btn" title="Forward 10s">⏭</button>
      <span class="apl-vol-group">
        🔊
        <input type="range" class="apl-vol-slider" id="apl-vol-slider"
               min="0" max="1" step="0.01" value="1" aria-label="Volume">
      </span>
    </div>
  `;

  playerEl = el;

  el.querySelector('#apl-close-btn')!.addEventListener('click', () => callbacks?.onClose());
  el.querySelector('#apl-playpause-btn')!.addEventListener('click', () => {
    if (phase === 'playing') callbacks?.onPause();
    else callbacks?.onPlay();
  });
  el.querySelector('#apl-rewind-btn')!.addEventListener('click', () => {
    const slider = el.querySelector<HTMLInputElement>('#apl-seek-slider');
    if (slider) callbacks?.onSeek(Math.max(0, parseFloat(slider.value) - 10));
  });
  el.querySelector('#apl-fwd-btn')!.addEventListener('click', () => {
    const slider = el.querySelector<HTMLInputElement>('#apl-seek-slider');
    if (slider) callbacks?.onSeek(parseFloat(slider.value) + 10);
  });
  const seekSlider = el.querySelector<HTMLInputElement>('#apl-seek-slider');
  if (seekSlider) seekSlider.addEventListener('input', () => callbacks?.onSeek(parseFloat(seekSlider.value)));
  const volSlider = el.querySelector<HTMLInputElement>('#apl-vol-slider');
  if (volSlider) volSlider.addEventListener('input', () => callbacks?.onVolumeChange(parseFloat(volSlider.value)));

  attachDragBehaviour(el);
  return el;
}

// ─── Drag behaviour ──────────────────────────────────────────────────────────

function attachDragBehaviour(el: HTMLElement): void {
  const handle = el.querySelector<HTMLElement>('.apl-drag-handle')!;
  let dragging = false;
  let ox = 0; // offset from mouse to element left edge
  let oy = 0;

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const move = (cx: number, cy: number) => {
    const x = clamp(cx - ox, 0, window.innerWidth - el.offsetWidth);
    const y = clamp(cy - oy, 0, window.innerHeight - el.offsetHeight);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  };

  // Mouse
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    const r = el.getBoundingClientRect();
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    el.style.transition = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
  const onMouseMove = (e: MouseEvent) => { if (dragging) move(e.clientX, e.clientY); };
  const onMouseUp = () => {
    dragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  // Touch
  handle.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.touches[0];
    const r = el.getBoundingClientRect();
    ox = t.clientX - r.left;
    oy = t.clientY - r.top;
    el.style.transition = 'none';
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }, { passive: false });
  const onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    move(t.clientX, t.clientY);
  };
  const onTouchEnd = () => {
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function showAudioPlayer(title: string, cbs: AudioPlayerCallbacks): void {
  if (!playerEl) return;
  callbacks = cbs;
  const titleEl = playerEl.querySelector<HTMLElement>('#apl-title');
  if (titleEl) titleEl.textContent = title;
  playerEl.classList.remove('audio-player-hidden');
  setPhase('loading');
}

export function hideAudioPlayer(): void {
  if (!playerEl) return;
  callbacks = null;
  playerEl.classList.add('audio-player-hidden');
  phase = 'hidden';
}

export function setPlayerPhase(p: PlayerPhase, extra?: { progress?: number; message?: string }): void {
  if (!playerEl) return;
  phase = p;

  const statusRow  = playerEl.querySelector<HTMLElement>('#apl-status')!;
  const seekRow    = playerEl.querySelector<HTMLElement>('#apl-seek-row')!;
  const ctrlRow    = playerEl.querySelector<HTMLElement>('#apl-controls')!;
  const statusText = playerEl.querySelector<HTMLElement>('#apl-status-text')!;
  const loaderFill = playerEl.querySelector<HTMLElement>('#apl-loader-fill')!;
  const ppBtn      = playerEl.querySelector<HTMLElement>('#apl-playpause-btn')!;

  const show = (el: HTMLElement) => { el.style.display = ''; };
  const hide = (el: HTMLElement) => { el.style.display = 'none'; };

  switch (p) {
    case 'loading':
      show(statusRow); hide(seekRow); hide(ctrlRow);
      statusText.textContent = extra?.progress != null
        ? `Loading model… ${extra.progress}%`
        : 'Loading model…';
      loaderFill.style.width = `${extra?.progress ?? 0}%`;
      break;

    case 'generating':
      show(statusRow); hide(seekRow); hide(ctrlRow);
      statusText.textContent = 'Generating audio…';
      loaderFill.style.width = '100%';
      loaderFill.classList.add('apl-loader-pulse');
      break;

    case 'playing':
      hide(statusRow); show(seekRow); show(ctrlRow);
      loaderFill.classList.remove('apl-loader-pulse');
      ppBtn.innerHTML = icon('pause');
      ppBtn.title = 'Pause';
      break;

    case 'paused':
      hide(statusRow); show(seekRow); show(ctrlRow);
      ppBtn.innerHTML = icon('play');
      ppBtn.title = 'Play';
      break;

    case 'error':
      show(statusRow); hide(seekRow); hide(ctrlRow);
      statusText.textContent = extra?.message ?? 'Error generating audio.';
      loaderFill.style.width = '0';
      break;
  }
}

function setPhase(p: PlayerPhase, extra?: { progress?: number; message?: string }) {
  setPlayerPhase(p, extra);
}

export function updatePlayerProgress(currentSec: number, durationSec: number): void {
  if (!playerEl) return;
  const slider = playerEl.querySelector<HTMLInputElement>('#apl-seek-slider');
  const timeCur = playerEl.querySelector<HTMLElement>('#apl-time-cur');
  const timeDur = playerEl.querySelector<HTMLElement>('#apl-time-dur');
  if (slider) {
    slider.max = String(durationSec);
    slider.value = String(currentSec);
  }
  if (timeCur) timeCur.textContent = formatTime(currentSec);
  if (timeDur) timeDur.textContent = formatTime(durationSec);
}

function formatTime(sec: number): string {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

