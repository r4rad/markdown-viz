import type { CommentMessage, CommentThread, Role } from '../types';
import { canCommentWorkspace } from './workspace-acl';
import {
  createContentYText,
  createRelativeAnchor,
  type YjsRelativeAnchorPayload,
} from './comment-anchors';

export type CommentMutationResult =
  | { ok: true; thread: CommentThread }
  | { ok: false; reason: 'forbidden' | 'invalid' };

export function buildCommentMessage(input: {
  id?: string;
  authorId: string;
  authorEmail?: string | null;
  body: string;
  now?: number;
}): CommentMessage {
  return {
    id: input.id ?? crypto.randomUUID(),
    authorId: input.authorId,
    authorEmail: input.authorEmail ?? null,
    body: input.body.trim(),
    createdAt: input.now ?? Date.now(),
  };
}

export function buildCommentThread(input: {
  id?: string;
  documentId: string;
  workspaceId: string;
  content: string;
  from: number;
  to: number;
  body: string;
  authorId: string;
  authorEmail?: string | null;
  now?: number;
  anchor?: YjsRelativeAnchorPayload;
}): CommentThread {
  const now = input.now ?? Date.now();
  const lo = Math.min(input.from, input.to);
  const hi = Math.max(input.from, input.to);
  const quote = input.content.slice(lo, hi);
  let anchor = input.anchor;
  if (!anchor) {
    const { ytext } = createContentYText(input.content);
    anchor = createRelativeAnchor(ytext, lo, hi);
  }
  const message = buildCommentMessage({
    authorId: input.authorId,
    authorEmail: input.authorEmail,
    body: input.body,
    now,
  });
  return {
    id: input.id ?? crypto.randomUUID(),
    documentId: input.documentId,
    workspaceId: input.workspaceId,
    anchor,
    quote,
    resolved: false,
    authorId: input.authorId,
    authorEmail: input.authorEmail ?? null,
    createdAt: now,
    updatedAt: now,
    messages: [message],
  };
}

/** Role-gated create: viewer cannot; commentator/editor/owner can. */
export function createCommentThread(
  role: Role | null | undefined,
  input: Parameters<typeof buildCommentThread>[0],
): CommentMutationResult {
  if (!canCommentWorkspace(role)) return { ok: false, reason: 'forbidden' };
  if (!input.body.trim()) return { ok: false, reason: 'invalid' };
  return { ok: true, thread: buildCommentThread(input) };
}

export function replyToCommentThread(
  role: Role | null | undefined,
  thread: CommentThread,
  input: { authorId: string; authorEmail?: string | null; body: string; now?: number },
): CommentMutationResult {
  if (!canCommentWorkspace(role)) return { ok: false, reason: 'forbidden' };
  if (!input.body.trim()) return { ok: false, reason: 'invalid' };
  const now = input.now ?? Date.now();
  const message = buildCommentMessage({ ...input, now });
  return {
    ok: true,
    thread: {
      ...thread,
      updatedAt: now,
      messages: [...thread.messages, message],
    },
  };
}

export function setCommentResolved(
  role: Role | null | undefined,
  thread: CommentThread,
  resolved: boolean,
  now = Date.now(),
): CommentMutationResult {
  if (!canCommentWorkspace(role)) return { ok: false, reason: 'forbidden' };
  return {
    ok: true,
    thread: { ...thread, resolved, updatedAt: now },
  };
}

export function openThreadsForDocument(
  threads: CommentThread[],
  documentId: string,
): CommentThread[] {
  return threads
    .filter(t => t.documentId === documentId && !t.resolved)
    .sort((a, b) => a.createdAt - b.createdAt);
}
