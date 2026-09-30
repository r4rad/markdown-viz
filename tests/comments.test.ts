import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import {
  createContentYText,
  createRelativeAnchor,
  resolveRelativeAnchor,
  isYjsRelativeAnchor,
  anchorSurvivesConcurrentEdit,
} from '../src/lib/comment-anchors';
import {
  createCommentThread,
  replyToCommentThread,
  setCommentResolved,
  openThreadsForDocument,
} from '../src/lib/comments';
import { threadsToGutterMarks } from '../src/lib/comment-gutter';
import {
  clearLocalCommentStore,
  loadCommentThreads,
  saveCommentThread,
} from '../src/lib/comment-store';
import type { CommentThread } from '../src/types';

describe('Yjs-relative comment anchors', () => {
  it('stores a Yjs-relative anchor (not raw offsets alone)', () => {
    const { ytext } = createContentYText('Hello World');
    const anchor = createRelativeAnchor(ytext, 6, 11);
    expect(isYjsRelativeAnchor(anchor)).toBe(true);
    expect(anchor.kind).toBe('yjs-relative');
    expect(anchor.fromHint).toBe(6);
    expect(anchor.toHint).toBe(11);
    expect(anchor.start).toBeTruthy();
    expect(anchor.end).toBeTruthy();
  });

  it('keeps the anchor attached better than raw offsets under concurrent edits', () => {
    const result = anchorSurvivesConcurrentEdit({
      content: 'Hello World',
      from: 6,
      to: 11,
      insertAt: 0,
      insertText: 'XXX',
    });
    expect(result.relativeQuote).toBe('World');
    expect(result.rawOffsetQuote).not.toBe('World');
    expect(result.relativeBetter).toBe(true);
  });

  it('resolves relative positions after inserts before the range', () => {
    const { ydoc, ytext } = createContentYText('abcDEF');
    const anchor = createRelativeAnchor(ytext, 3, 6);
    ydoc.transact(() => {
      ytext.insert(0, '!!');
    }, 'edit');
    const resolved = resolveRelativeAnchor(ydoc, anchor);
    expect(resolved).toEqual({ from: 5, to: 8 });
    expect(ytext.toString().slice(resolved!.from, resolved!.to)).toBe('DEF');
  });
});

describe('comment ACL + threads', () => {
  beforeEach(() => {
    clearLocalCommentStore();
  });

  it('allows commentator to create; rejects viewer', () => {
    const ok = createCommentThread('commentator', {
      documentId: 'doc-1',
      workspaceId: 'ws-1',
      content: 'Hello World',
      from: 0,
      to: 5,
      body: 'Needs review',
      authorId: 'u-c',
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(isYjsRelativeAnchor(ok.thread.anchor)).toBe(true);
      expect(ok.thread.quote).toBe('Hello');
      expect(ok.thread.resolved).toBe(false);
    }

    const denied = createCommentThread('viewer', {
      documentId: 'doc-1',
      workspaceId: 'ws-1',
      content: 'Hello World',
      from: 0,
      to: 5,
      body: 'Nope',
      authorId: 'u-v',
    });
    expect(denied).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('supports resolve and reopen for commentator', () => {
    const created = createCommentThread('commentator', {
      documentId: 'doc-1',
      workspaceId: 'ws-1',
      content: 'text',
      from: 0,
      to: 4,
      body: 'note',
      authorId: 'u1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const resolved = setCommentResolved('commentator', created.thread, true);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.thread.resolved).toBe(true);

    const reopened = setCommentResolved('commentator', (resolved as { ok: true; thread: CommentThread }).thread, false);
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.thread.resolved).toBe(false);

    const viewerResolve = setCommentResolved('viewer', created.thread, true);
    expect(viewerResolve).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('allows reply for commentator and rejects viewer', () => {
    const created = createCommentThread('editor', {
      documentId: 'doc-1',
      workspaceId: 'ws-1',
      content: 'body',
      from: 0,
      to: 4,
      body: 'first',
      authorId: 'u1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const reply = replyToCommentThread('commentator', created.thread, {
      authorId: 'u2',
      body: 'second',
    });
    expect(reply.ok).toBe(true);
    if (reply.ok) expect(reply.thread.messages).toHaveLength(2);

    const denied = replyToCommentThread('viewer', created.thread, {
      authorId: 'u3',
      body: 'blocked',
    });
    expect(denied).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('persists threads in the comments subcollection store (local)', async () => {
    const created = createCommentThread('owner', {
      documentId: 'doc-1',
      workspaceId: 'ws-local',
      content: 'Hello',
      from: 0,
      to: 5,
      body: 'hi',
      authorId: 'u1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await saveCommentThread(created.thread);
    const loaded = await loadCommentThreads('ws-local', 'doc-1');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(created.thread.id);
    expect(isYjsRelativeAnchor(loaded[0].anchor)).toBe(true);
  });

  it('maps open threads to gutter marks via relative anchors', () => {
    const created = createCommentThread('editor', {
      id: 't1',
      documentId: 'doc-1',
      workspaceId: 'ws-1',
      content: 'line1\nline2 comment here\nline3',
      from: 6,
      to: 11,
      body: 'mark',
      authorId: 'u1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const marks = threadsToGutterMarks([created.thread], 'line1\nline2 comment here\nline3');
    expect(marks).toHaveLength(1);
    expect(marks[0].threadId).toBe('t1');
    expect(marks[0].line).toBe(2);
  });

  it('openThreadsForDocument filters resolved', () => {
    const a = createCommentThread('editor', {
      id: 'a',
      documentId: 'd1',
      workspaceId: 'w',
      content: 'x',
      from: 0,
      to: 1,
      body: 'a',
      authorId: 'u',
    });
    const b = createCommentThread('editor', {
      id: 'b',
      documentId: 'd1',
      workspaceId: 'w',
      content: 'x',
      from: 0,
      to: 1,
      body: 'b',
      authorId: 'u',
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const resolved = setCommentResolved('editor', b.thread, true);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const open = openThreadsForDocument([a.thread, resolved.thread], 'd1');
    expect(open.map(t => t.id)).toEqual(['a']);
  });
});

describe('Y.Text relative position API smoke', () => {
  it('round-trips relativePositionToJSON', () => {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('content');
    ytext.insert(0, 'abcd');
    const rel = Y.createRelativePositionFromTypeIndex(ytext, 2);
    const json = Y.relativePositionToJSON(rel);
    const back = Y.createRelativePositionFromJSON(json);
    const abs = Y.createAbsolutePositionFromRelativePosition(back, ydoc);
    expect(abs?.index).toBe(2);
  });
});
