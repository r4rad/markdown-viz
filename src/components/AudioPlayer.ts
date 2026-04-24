import { icon } from './icons';
import type { AudioState } from '../lib/audio';

let playerEl: HTMLElement | null = null;

export function createAudioPlayer(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'audio-player audio-player-hidden';
  el.id = 'audio-player';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Audio player');
  el.innerHTML = `
    <span class="audio-player-label">Listening…</span>
    <div class="audio-player-controls">
      <button class="audio-ctrl-btn" id="audio-pause-btn" title="Pause">
        ${icon('pause')}
      </button>
      <button class="audio-ctrl-btn" id="audio-resume-btn" title="Resume" style="display:none">
        ${icon('play')}
      </button>
      <button class="audio-ctrl-btn" id="audio-stop-btn" title="Stop">
        ${icon('stop')}
      </button>
    </div>
  `;
  playerEl = el;
  return el;
}

export function showAudioPlayer(
  onPause: () => void,
  onResume: () => void,
  onStop: () => void,
): void {
  if (!playerEl) return;
  playerEl.classList.remove('audio-player-hidden');
  playerEl.querySelector('#audio-pause-btn')?.addEventListener('click', onPause, { once: false });
  playerEl.querySelector('#audio-resume-btn')?.addEventListener('click', onResume, { once: false });
  playerEl.querySelector('#audio-stop-btn')?.addEventListener('click', onStop, { once: false });
}

export function updateAudioPlayerState(state: AudioState): void {
  if (!playerEl) return;
  const pauseBtn = playerEl.querySelector('#audio-pause-btn') as HTMLElement | null;
  const resumeBtn = playerEl.querySelector('#audio-resume-btn') as HTMLElement | null;
  const label = playerEl.querySelector('.audio-player-label') as HTMLElement | null;

  if (state === 'playing') {
    if (pauseBtn) pauseBtn.style.display = '';
    if (resumeBtn) resumeBtn.style.display = 'none';
    if (label) label.textContent = 'Listening…';
    playerEl.classList.remove('audio-player-hidden');
  } else if (state === 'paused') {
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (resumeBtn) resumeBtn.style.display = '';
    if (label) label.textContent = 'Paused';
  } else {
    playerEl.classList.add('audio-player-hidden');
  }
}
