import { emit } from '../lib/events';
import {
  resolveGithubConflict,
  resolutionFromAction,
  type ConflictPreview,
} from '../lib/github-conflict';
import { threeWayMerge } from '../lib/three-way-merge';
import { updateTabContent, setTabSyncStatus } from '../lib/state';
import type { ConflictResolution, SyncStatus } from '../types';

/**
 * Conflict resolve modal: keep-local / take-remote / merged (three-way view).
 */
export function openConflictModal(preview: ConflictPreview): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'workspace-modal-overlay conflict-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Resolve sync conflict');

  const mergeHint = threeWayMerge(
    preview.baseContent,
    preview.localContent,
    preview.remoteContent,
  );
  const previewText = mergeHint.conflict
    ? mergeHint.conflicted
    : mergeHint.merged;

  overlay.innerHTML = `
    <div class="workspace-modal conflict-modal">
      <h3>Sync conflict</h3>
      <p class="conflict-modal-hint">Local and remote both changed overlapping content. Choose how to resolve.</p>
      <pre class="conflict-preview" id="conflict-preview"></pre>
      <label class="conflict-merged-label">Merged content (for Merged resolve)
        <textarea id="conflict-merged" rows="6"></textarea>
      </label>
      <div class="workspace-modal-actions conflict-actions">
        <button type="button" data-act="keep-local">Keep local</button>
        <button type="button" data-act="take-remote">Take remote</button>
        <button type="button" data-act="merged">Use merged</button>
        <button type="button" data-act="close">Cancel</button>
      </div>
      <p class="conflict-error" id="conflict-error" hidden></p>
    </div>
  `;

  const pre = overlay.querySelector('#conflict-preview') as HTMLElement;
  pre.textContent = previewText;
  const mergedArea = overlay.querySelector('#conflict-merged') as HTMLTextAreaElement;
  mergedArea.value = previewText;
  const errEl = overlay.querySelector('#conflict-error') as HTMLElement;

  const close = () => overlay.remove();

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('[data-act="close"]')?.addEventListener('click', close);

  const runResolve = async (action: 'keep-local' | 'take-remote' | 'merged') => {
    errEl.hidden = true;
    const resolution: ConflictResolution = resolutionFromAction(action);
    const mergedContent =
      action === 'merged' ? mergedArea.value : undefined;
    try {
      const result = await resolveGithubConflict(
        preview.id,
        resolution,
        mergedContent,
      );
      const nextStatus: SyncStatus =
        result?.document.syncStatus ??
        (resolution === 'local' ? 'Ahead' : 'InSync');
      const nextContent =
        result?.document.localContent ??
        (resolution === 'local'
          ? preview.localContent
          : resolution === 'remote'
            ? preview.remoteContent
            : mergedArea.value);

      updateTabContent(preview.documentId, nextContent);
      setTabSyncStatus(preview.documentId, nextStatus, null);
      emit('conflict-resolved', {
        conflictId: preview.id,
        documentId: preview.documentId,
        resolution,
        syncStatus: nextStatus,
      });
      close();
    } catch (err) {
      errEl.hidden = false;
      errEl.textContent =
        err instanceof Error ? err.message : 'Failed to resolve conflict';
    }
  };

  overlay
    .querySelector('[data-act="keep-local"]')
    ?.addEventListener('click', () => void runResolve('keep-local'));
  overlay
    .querySelector('[data-act="take-remote"]')
    ?.addEventListener('click', () => void runResolve('take-remote'));
  overlay
    .querySelector('[data-act="merged"]')
    ?.addEventListener('click', () => void runResolve('merged'));

  document.body.appendChild(overlay);
  return overlay;
}
