import { createToolbar } from './Toolbar';
import { createTabBar } from './TabBar';
import { createEditor, getEditorView } from './Editor';
import { createPreview } from './Preview';
import { createStatusBar } from './StatusBar';
import {
  createAudioPlayer, showAudioPlayer, hideAudioPlayer,
  setPlayerPhase, updatePlayerProgress,
} from './AudioPlayer';
import type { AudioPlayerCallbacks } from './AudioPlayer';
import { initDiagramModal } from './DiagramModal';
import { initSettingsMenu, openSettingsMenu } from './SettingsMenu';
import { getState, addTab, restoreState, toggleEditor, togglePreview, getActiveTab } from '../lib/state';
import { on, emit } from '../lib/events';
import { loadState, debouncedSave } from '../lib/storage';
import { applyTheme, getSavedTheme } from '../themes/themes';
import { setupImport, openFilePicker } from '../lib/import';
import { exportMarkdown, exportHTML, exportPDF, exportDOCX } from '../lib/export';
import { beautifyMarkdown } from '../lib/beautifier';
import { initFirebase, syncToCloud, updateCloudFileName, isAuthenticated, getCurrentUser } from '../lib/auth';
import { initAuthUI } from './AuthUI';
import { shareDocument, loadSharedDocument, getShareIdFromURL, buildShareURL, triggerSystemShare, isSharingEnabled } from '../lib/share';
import { computeChecksum, startCollaboration, stopCollaboration, getActiveSession } from '../lib/crdt';
import { writeSyncLog } from '../lib/sync-log';
import {
  generateAudioScript, isCacheValid, loadAudioCache, saveAudioCache,
  float32ToWav, loadCachedAudio, cacheAudio,
} from '../lib/audio';
import { initKokoro, synthesizeAudio, playWavBuffer } from '../lib/tts';
import type { AudioControls } from '../lib/tts';
import type { UserProfile } from '../types';


export async function initApp(): Promise<void> {
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  app.className = 'app-container';

  // Apply saved theme
  const savedTheme = getSavedTheme();
  applyTheme(savedTheme);

  // Restore state from IndexedDB
  const saved = await loadState();
  if (saved) restoreState(saved);

  // Build UI
  const toolbar = createToolbar();
  const tabBar = createTabBar();
  const mainArea = document.createElement('div');
  mainArea.className = 'main-area';

  const editorPane = createEditor();
  const splitHandle = createSplitHandle(mainArea);
  const previewPane = createPreview();
  const statusBar = createStatusBar();
  const audioPlayer = createAudioPlayer();

  mainArea.append(editorPane, splitHandle, previewPane);
  app.append(toolbar, tabBar, createBetaBanner(), mainArea, statusBar, audioPlayer);

  // Initialize subsystems
  initDiagramModal();
  initSettingsMenu();
  setupImport();
  setupKeyboardShortcuts();
  initFirebase();
  initAuthUI();
  setupAutoSync();

  // Check if we arrived via a shared document URL
  await loadSharedDocFromURL();

  // Wire up events
  on('import-file', () => openFilePicker());

  on('file-imported', (data: unknown) => {
    const { name, content } = data as { name: string; content: string };
    addTab(name, content);
  });

  on('export', (format: unknown) => {
    switch (format) {
      case 'md': exportMarkdown(); break;
      case 'html': exportHTML(); break;
      case 'pdf': exportPDF(); break;
      case 'docx': exportDOCX(); break;
    }
  });

  on('beautify', () => beautifyMarkdown());

  // Copy editor content to clipboard
  on('copy-editor', () => {
    const tab = getActiveTab();
    if (tab) navigator.clipboard.writeText(tab.content).catch(console.error);
  });

  // Cloud sync button + Ctrl+S
  on('cloud-sync-request', () => triggerCloudSync());

  // Share button
  on('share-request', () => handleShareRequest());

  // Play audio button
  on('play-audio-request', () => handlePlayAudio());

  // Rename cloud file when tab is renamed
  on('tab-renamed', (data: unknown) => {
    const { id, name } = data as { id: string; name: string };
    if (isAuthenticated()) {
      updateCloudFileName(id, name).catch(console.error);
    }
  });

  // Layout visibility
  on('layout-changed', () => {
    const state = getState();
    editorPane.classList.toggle('pane-hidden', !state.showEditor);
    previewPane.classList.toggle('pane-hidden', !state.showPreview);
    splitHandle.classList.toggle('pane-hidden', !(state.showEditor && state.showPreview));
    if (state.showEditor) {
      requestAnimationFrame(() => getEditorView()?.requestMeasure());
    }
  });

  // Auto-save state
  on('state-changed', () => debouncedSave(getState()));
  on('content-changed', () => debouncedSave(getState()));

  // Focus editor
  requestAnimationFrame(() => getEditorView()?.focus());
}

function createSplitHandle(mainArea: HTMLElement): HTMLElement {
  const handle = document.createElement('div');
  handle.className = 'split-handle';

  let startPos = 0;
  let startSize = 0;

  const isMobileLayout = () => window.innerWidth <= 768;

  const resize = (clientPos: number) => {
    const isVertical = isMobileLayout();
    const delta = clientPos - startPos;
    const newSize = startSize + delta;
    const totalSize = isVertical ? mainArea.clientHeight : mainArea.clientWidth;
    const pct = Math.max(15, Math.min(85, (newSize / totalSize) * 100));
    const editorPane = mainArea.querySelector('.editor-pane') as HTMLElement;
    const previewPane = mainArea.querySelector('.preview-pane') as HTMLElement;
    if (editorPane && previewPane) {
      editorPane.style.flex = `0 0 ${pct}%`;
      previewPane.style.flex = '1';
    }
    requestAnimationFrame(() => getEditorView()?.requestMeasure());
  };

  const onMouseMove = (e: MouseEvent) => {
    resize(isMobileLayout() ? e.clientY : e.clientX);
  };

  const onMouseUp = () => {
    handle.classList.remove('dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const isVertical = isMobileLayout();
    startPos = isVertical ? e.clientY : e.clientX;
    const editorPane = mainArea.querySelector('.editor-pane') as HTMLElement;
    startSize = isVertical ? (editorPane?.offsetHeight ?? 0) : (editorPane?.offsetWidth ?? 0);
    handle.classList.add('dragging');
    document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  handle.addEventListener('touchstart', (e) => {
    const touch = (e as TouchEvent).touches[0];
    const isVertical = isMobileLayout();
    startPos = isVertical ? touch.clientY : touch.clientX;
    const editorPane = mainArea.querySelector('.editor-pane') as HTMLElement;
    startSize = isVertical ? (editorPane?.offsetHeight ?? 0) : (editorPane?.offsetWidth ?? 0);
    handle.classList.add('dragging');

    const onTouchMove = (ev: Event) => {
      const t = (ev as TouchEvent).touches[0];
      resize(isVertical ? t.clientY : t.clientX);
    };

    const onTouchEnd = () => {
      handle.classList.remove('dragging');
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
  }, { passive: true });

  return handle;
}

function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === 'b') {
      e.preventDefault();
      emit('toolbar-action', 'bold');
    } else if (ctrl && e.key === 'i') {
      e.preventDefault();
      emit('toolbar-action', 'italic');
    } else if (ctrl && e.key === 'k') {
      e.preventDefault();
      emit('toolbar-action', 'link');
    } else if (ctrl && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      emit('beautify');
    } else if (ctrl && e.key === 's') {
      e.preventDefault();
      debouncedSaveNow();
      if (isAuthenticated()) {
        triggerCloudSync();
      }
    } else if (ctrl && e.key === 'n') {
      e.preventDefault();
      addTab();
    }
  });
}

let cloudSyncBusy = false;
async function triggerCloudSync(): Promise<void> {
  if (cloudSyncBusy || !isAuthenticated()) return;
  cloudSyncBusy = true;

  const btn = document.getElementById('cloud-sync-btn');
  if (btn) btn.classList.add('syncing');

  const tab = getActiveTab();
  const ok = await syncToCloud(getState());

  if (ok && tab) {
    const user = getCurrentUser();
    const checksum = await computeChecksum(tab.content);
    const session = getActiveSession(tab.id);
    writeSyncLog({
      docId: tab.id,
      userId: user?.uid ?? 'unknown',
      userEmail: user?.email ?? null,
      displayName: user?.displayName ?? null,
      syncedAt: Date.now(),
      checksum,
      deltaBytes: new TextEncoder().encode(tab.content).byteLength,
      source: session ? 'collaborative' : 'personal',
    }).catch(console.error);
  }

  if (btn) {
    btn.classList.remove('syncing');
    btn.classList.add(ok ? 'sync-ok' : 'sync-fail');
    setTimeout(() => btn.classList.remove('sync-ok', 'sync-fail'), 1500);
  }
  cloudSyncBusy = false;
}

let autoSyncTimer: ReturnType<typeof setInterval> | null = null;

function setupAutoSync(): void {
  const intervalSec = Number(import.meta.env.VITE_AUTO_SYNC_INTERVAL_SECONDS ?? 60);
  const intervalMs = (Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec : 60) * 1000;

  on('auth-changed', (profile: unknown) => {
    if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null; }
    if (profile) {
      autoSyncTimer = setInterval(async () => {
        if (!isAuthenticated()) return;
        const tab = getActiveTab();
        const ok = await syncToCloud(getState()).catch(() => false);
        if (ok && tab) {
          const user = getCurrentUser();
          const checksum = await computeChecksum(tab.content);
          const session = getActiveSession(tab.id);
          writeSyncLog({
            docId: tab.id,
            userId: user?.uid ?? 'unknown',
            userEmail: user?.email ?? null,
            displayName: user?.displayName ?? null,
            syncedAt: Date.now(),
            checksum,
            deltaBytes: new TextEncoder().encode(tab.content).byteLength,
            source: session ? 'collaborative' : 'personal',
          }).catch(console.error);
        }
      }, intervalMs);
    }
  });
}

function debouncedSaveNow(): void {
  debouncedSave(getState(), 0);
}

function createBetaBanner(): HTMLElement {
  const DISMISS_KEY = 'mv-beta-banner-dismissed';
  const banner = document.createElement('div');
  banner.className = 'beta-banner';

  if (sessionStorage.getItem(DISMISS_KEY)) {
    banner.style.display = 'none';
    return banner;
  }

  banner.innerHTML = `
    <span>🚧 <strong>Beta</strong> — work is always saved locally.
    Sign in to sync up to <strong>10 documents</strong> across your devices for free.</span>
    <div class="beta-banner-actions">
      <button class="beta-banner-link beta-signin-btn">Sign in</button>
      <button class="beta-banner-dismiss" title="Dismiss">×</button>
    </div>
  `;

  banner.querySelector('.beta-banner-dismiss')!.addEventListener('click', () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    banner.remove();
  });

  banner.querySelector('.beta-signin-btn')!.addEventListener('click', () => {
    openSettingsMenu();
  });

  // Hide the sign-in button once user is logged in
  on('auth-changed', (profile: unknown) => {
    const signInBtn = banner.querySelector('.beta-signin-btn') as HTMLElement | null;
    if (signInBtn) signInBtn.style.display = (profile as UserProfile | null) ? 'none' : '';
  });

  return banner;
}

let activeAudioControls: AudioControls | null = null;

async function handlePlayAudio(): Promise<void> {
  const tab = getActiveTab();
  if (!tab) return;

  const docTitle = tab.name || 'Document';
  const cbs: AudioPlayerCallbacks = {
    onPlay:   () => { activeAudioControls?.resume(); setPlayerPhase('playing'); },
    onPause:  () => { activeAudioControls?.pause();  setPlayerPhase('paused');  },
    onStop:   () => { activeAudioControls?.stop();   hideAudioPlayer();         },
    onSeek:   (s) => activeAudioControls?.seek(s),
    onVolumeChange: (v) => activeAudioControls?.setVolume(v),
    onClose:  () => { activeAudioControls?.stop();   hideAudioPlayer();         },
  };

  showAudioPlayer(docTitle, cbs);

  // ── 1. Determine / generate text script ──────────────────────────────────
  const checksum = await computeChecksum(tab.content);

  let script: string;
  const cached = await loadAudioCache(checksum);
  if (isCacheValid(cached, checksum)) {
    script = cached!.script;
  } else {
    script = generateAudioScript(tab.content);
    if (script && isAuthenticated()) {
      const user = getCurrentUser();
      saveAudioCache(checksum, script, user?.uid ?? 'anonymous').catch(console.error);
    }
  }
  if (!script) { hideAudioPlayer(); return; }

  // ── 2. Check IndexedDB for already-synthesized WAV ────────────────────────
  const wavBuf = await loadCachedAudio(checksum);
  if (wavBuf) {
    activeAudioControls = playWavBuffer(wavBuf, {
      onProgress: (cur, dur) => updatePlayerProgress(cur, dur),
      onEnded:    ()          => { setPlayerPhase('paused'); },
      onError:    (msg)       => setPlayerPhase('error', { message: msg }),
    });
    setPlayerPhase('playing');
    return;
  }

  // ── 3. Synthesize with Kokoro (model loads lazily) ────────────────────────
  try {
    let result: { audio: Float32Array; sampleRate: number };
    result = await synthesizeAudio(script, {
      onModelProgress: (pct) => setPlayerPhase('loading', { progress: pct }),
      onGenerating: ()       => setPlayerPhase('generating'),
    });

    const buffer = float32ToWav(result.audio, result.sampleRate);
    cacheAudio(checksum, buffer.slice(0)).catch(console.error);

    activeAudioControls = playWavBuffer(buffer, {
      onProgress: (cur, dur) => updatePlayerProgress(cur, dur),
      onEnded:    ()          => { setPlayerPhase('paused'); },
      onError:    (msg)       => setPlayerPhase('error', { message: msg }),
    });
    setPlayerPhase('playing');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'TTS error';
    setPlayerPhase('error', { message: msg });
  }
}

async function handleShareRequest(): Promise<void> {  if (!isSharingEnabled() || !isAuthenticated()) return;
  const tab = getActiveTab();
  if (!tab) return;

  const btn = document.getElementById('share-btn');
  if (btn) btn.classList.add('sharing');

  const docId = await shareDocument(tab);
  if (docId) {
    const url = buildShareURL(docId);
    await triggerSystemShare(url, tab.name);
  }

  if (btn) {
    btn.classList.remove('sharing');
  }
}

async function loadSharedDocFromURL(): Promise<void> {
  const shareId = getShareIdFromURL(window.location.href);
  if (!shareId) return;

  const doc = await loadSharedDocument(shareId);
  if (doc) {
    addTab(doc.name, doc.content);
  }
  // Clean URL without reload
  window.history.replaceState(null, '', '/');
}
