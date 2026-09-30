import { getActiveTab, getState } from '../lib/state';
import { getCurrentUser } from '../lib/auth';
import { canCommentWorkspace } from '../lib/workspace-acl';
import {
  createCommentThread,
  replyToCommentThread,
  setCommentResolved,
  openThreadsForDocument,
} from '../lib/comments';
import { loadCommentThreads, saveCommentThread } from '../lib/comment-store';
import { emit, on } from '../lib/events';
import type { CommentThread } from '../types';

let panelEl: HTMLElement | null = null;
let cachedThreads: CommentThread[] = [];
let selectedThreadId: string | null = null;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function canComment(): boolean {
  return canCommentWorkspace(getState().currentRole);
}

export function getCachedCommentThreads(): CommentThread[] {
  return cachedThreads;
}

export function createCommentsPanel(): HTMLElement {
  panelEl = document.createElement('aside');
  panelEl.id = 'comments-panel';
  panelEl.className = 'comments-panel comments-panel-collapsed';
  panelEl.setAttribute('aria-label', 'Comments');
  panelEl.innerHTML = `
    <div class="comments-panel-header">
      <h3>Comments</h3>
      <button type="button" id="comments-close" aria-label="Close comments">×</button>
    </div>
    <div class="comments-panel-toolbar">
      <button type="button" id="comments-new" ${canComment() ? '' : 'disabled'}>New on selection</button>
      <label class="comments-show-resolved"><input type="checkbox" id="comments-show-resolved" /> Resolved</label>
    </div>
    <div class="comments-panel-list" id="comments-list"></div>
    <div class="comments-panel-detail" id="comments-detail" hidden></div>
  `;

  panelEl.querySelector('#comments-close')!.addEventListener('click', () => {
    setCommentsPanelOpen(false);
  });
  panelEl.querySelector('#comments-new')!.addEventListener('click', () => {
    void createThreadFromSelection();
  });
  panelEl.querySelector('#comments-show-resolved')!.addEventListener('change', () => {
    renderList();
  });

  on('active-tab-changed', () => {
    void refreshComments();
  });
  on('comments-changed', () => {
    renderList();
    renderDetail();
    emitCommentMarks();
  });
  on('state-changed', () => {
    const btn = panelEl?.querySelector('#comments-new') as HTMLButtonElement | null;
    if (btn) btn.disabled = !canComment();
  });

  return panelEl;
}

export function setCommentsPanelOpen(open: boolean): void {
  if (!panelEl) return;
  panelEl.classList.toggle('comments-panel-collapsed', !open);
  if (open) void refreshComments();
}

export function toggleCommentsPanel(): void {
  if (!panelEl) return;
  setCommentsPanelOpen(panelEl.classList.contains('comments-panel-collapsed'));
}

export async function refreshComments(): Promise<void> {
  const tab = getActiveTab();
  const wsId = getState().activeWorkspaceId;
  if (!tab) {
    cachedThreads = [];
    emit('comments-changed', cachedThreads);
    return;
  }
  cachedThreads = await loadCommentThreads(wsId, tab.id);
  emit('comments-changed', cachedThreads);
}

function emitCommentMarks(): void {
  const tab = getActiveTab();
  if (!tab) {
    emit('comment-marks-changed', []);
    return;
  }
  emit('comment-marks-changed', cachedThreads.filter(t => t.documentId === tab.id));
}

function renderList(): void {
  const list = panelEl?.querySelector('#comments-list');
  if (!list || !panelEl) return;
  const tab = getActiveTab();
  const showResolved = (panelEl.querySelector('#comments-show-resolved') as HTMLInputElement).checked;
  list.replaceChildren();

  if (!tab) {
    list.textContent = 'Open a document to see comments.';
    return;
  }

  let threads = cachedThreads.filter(t => t.documentId === tab.id);
  if (!showResolved) threads = threads.filter(t => !t.resolved);
  threads = threads.sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.updatedAt - a.updatedAt);

  if (!threads.length) {
    list.textContent = showResolved ? 'No comments.' : 'No open threads.';
    return;
  }

  for (const thread of threads) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'comments-thread-row' + (thread.resolved ? ' is-resolved' : '');
    row.dataset.threadId = thread.id;
    const preview = thread.messages[0]?.body ?? '';
    row.innerHTML = `
      <span class="comments-thread-quote">“${escapeHtml(thread.quote || '(empty)')}”</span>
      <span class="comments-thread-preview">${escapeHtml(preview.slice(0, 120))}</span>
      <span class="comments-thread-meta">${thread.resolved ? 'Resolved' : 'Open'} · ${thread.messages.length}</span>
    `;
    row.addEventListener('click', () => {
      selectedThreadId = thread.id;
      renderDetail();
    });
    list.appendChild(row);
  }
}

function renderDetail(): void {
  const detail = panelEl?.querySelector('#comments-detail') as HTMLElement | null;
  if (!detail || !panelEl) return;
  const thread = cachedThreads.find(t => t.id === selectedThreadId);
  if (!thread) {
    detail.hidden = true;
    detail.replaceChildren();
    return;
  }
  detail.hidden = false;
  const allow = canComment();
  detail.innerHTML = `
    <div class="comments-detail-quote">“${escapeHtml(thread.quote || '(empty)')}”</div>
    <div class="comments-detail-messages" id="comments-messages"></div>
    ${allow ? `<p class="comments-reply-row"><input id="comments-reply" placeholder="Reply…" /><button type="button" id="comments-reply-btn">Reply</button></p>` : '<p class="comments-viewer-hint">Viewers cannot comment.</p>'}
    <p class="comments-resolve-row">
      ${allow ? `<button type="button" id="comments-toggle-resolved">${thread.resolved ? 'Reopen' : 'Resolve'}</button>` : ''}
      <button type="button" id="comments-back">Back</button>
    </p>
  `;

  const msgs = detail.querySelector('#comments-messages')!;
  for (const m of thread.messages) {
    const div = document.createElement('div');
    div.className = 'comments-message';
    div.innerHTML = `<strong>${escapeHtml(m.authorEmail || m.authorId)}</strong>
      <span>${escapeHtml(m.body)}</span>`;
    msgs.appendChild(div);
  }

  detail.querySelector('#comments-back')?.addEventListener('click', () => {
    selectedThreadId = null;
    renderDetail();
  });

  detail.querySelector('#comments-toggle-resolved')?.addEventListener('click', async () => {
    const result = setCommentResolved(getState().currentRole, thread, !thread.resolved);
    if (!result.ok) {
      window.alert('You cannot resolve comments with your role.');
      return;
    }
    await saveCommentThread(result.thread);
    cachedThreads = cachedThreads.map(t => (t.id === result.thread.id ? result.thread : t));
    emit('comments-changed', cachedThreads);
  });

  detail.querySelector('#comments-reply-btn')?.addEventListener('click', async () => {
    const input = detail.querySelector('#comments-reply') as HTMLInputElement;
    const user = getCurrentUser();
    const result = replyToCommentThread(getState().currentRole, thread, {
      authorId: user?.uid || 'unknown',
      authorEmail: user?.email ?? null,
      body: input.value,
    });
    if (!result.ok) {
      window.alert(result.reason === 'forbidden'
        ? 'Viewers cannot reply to comments.'
        : 'Enter a reply.');
      return;
    }
    await saveCommentThread(result.thread);
    cachedThreads = cachedThreads.map(t => (t.id === result.thread.id ? result.thread : t));
    selectedThreadId = result.thread.id;
    emit('comments-changed', cachedThreads);
  });
}

async function createThreadFromSelection(): Promise<void> {
  if (!canComment()) {
    window.alert('Viewers cannot create comments.');
    return;
  }
  const tab = getActiveTab();
  const wsId = getState().activeWorkspaceId;
  if (!tab) {
    window.alert('Open a document first.');
    return;
  }

  const sel = await requestEditorSelection();
  const from = sel?.from ?? 0;
  const to = sel?.to ?? Math.min(tab.content.length, 1);
  const body = window.prompt('Comment');
  if (body == null) return;

  const user = getCurrentUser();
  const result = createCommentThread(getState().currentRole, {
    documentId: tab.id,
    workspaceId: wsId,
    content: tab.content,
    from,
    to: to === from ? Math.min(from + 1, tab.content.length) : to,
    body,
    authorId: user?.uid || 'unknown',
    authorEmail: user?.email ?? null,
  });
  if (!result.ok) {
    window.alert(result.reason === 'forbidden'
      ? 'Viewers cannot create comments.'
      : 'Enter a comment.');
    return;
  }
  await saveCommentThread(result.thread);
  cachedThreads = [...cachedThreads.filter(t => t.id !== result.thread.id), result.thread];
  selectedThreadId = result.thread.id;
  setCommentsPanelOpen(true);
  emit('comments-changed', cachedThreads);
}

function requestEditorSelection(): Promise<{ from: number; to: number } | null> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(null), 50);
    const off = on('editor-selection', (data: unknown) => {
      window.clearTimeout(timeout);
      off();
      const d = data as { from: number; to: number };
      resolve(d);
    });
    emit('request-editor-selection');
  });
}

/** Open panel focused on a thread (e.g. gutter click). */
export function focusCommentThread(threadId: string): void {
  selectedThreadId = threadId;
  setCommentsPanelOpen(true);
  renderList();
  renderDetail();
}

export { openThreadsForDocument };
