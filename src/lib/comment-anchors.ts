import * as Y from 'yjs';
import type { CommentAnchor } from '../types';

/** Serializable Yjs-relative range (JSON relative positions + optional hints). */
export interface YjsRelativeAnchorPayload {
  kind: 'yjs-relative';
  start: ReturnType<typeof Y.relativePositionToJSON>;
  end: ReturnType<typeof Y.relativePositionToJSON>;
  /** Creation-time offsets — hints only, not sole truth. */
  fromHint?: number;
  toHint?: number;
}

export function isYjsRelativeAnchor(anchor: CommentAnchor): anchor is YjsRelativeAnchorPayload {
  if (!anchor || typeof anchor !== 'object') return false;
  const a = anchor as Record<string, unknown>;
  return a.kind === 'yjs-relative' && a.start != null && a.end != null;
}

/** Build a throwaway Y.Doc/Y.Text from markdown for encoding/resolving anchors. */
export function createContentYText(content: string): { ydoc: Y.Doc; ytext: Y.Text } {
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText('content');
  if (content) {
    ydoc.transact(() => {
      ytext.insert(0, content);
    }, 'init');
  }
  return { ydoc, ytext };
}

/** Store a selection as Yjs relative positions (survives concurrent inserts better than raw offsets). */
export function createRelativeAnchor(
  ytext: Y.Text,
  from: number,
  to: number,
): YjsRelativeAnchorPayload {
  const lo = Math.max(0, Math.min(from, to, ytext.length));
  const hi = Math.max(0, Math.min(Math.max(from, to), ytext.length));
  const start = Y.createRelativePositionFromTypeIndex(ytext, lo);
  const end = Y.createRelativePositionFromTypeIndex(ytext, hi);
  return {
    kind: 'yjs-relative',
    start: Y.relativePositionToJSON(start),
    end: Y.relativePositionToJSON(end),
    fromHint: lo,
    toHint: hi,
  };
}

/** Resolve a Yjs-relative anchor against the current document. */
export function resolveRelativeAnchor(
  ydoc: Y.Doc,
  anchor: CommentAnchor,
): { from: number; to: number } | null {
  if (!isYjsRelativeAnchor(anchor)) return null;
  try {
    const startRel = Y.createRelativePositionFromJSON(anchor.start);
    const endRel = Y.createRelativePositionFromJSON(anchor.end);
    const startAbs = Y.createAbsolutePositionFromRelativePosition(startRel, ydoc);
    const endAbs = Y.createAbsolutePositionFromRelativePosition(endRel, ydoc);
    if (!startAbs || !endAbs) return null;
    return {
      from: Math.min(startAbs.index, endAbs.index),
      to: Math.max(startAbs.index, endAbs.index),
    };
  } catch {
    return null;
  }
}

/**
 * Demonstrate / verify that relative anchors track text better than raw offsets
 * when concurrent inserts happen before the selection.
 */
export function anchorSurvivesConcurrentEdit(params: {
  content: string;
  from: number;
  to: number;
  insertAt: number;
  insertText: string;
}): { relativeQuote: string; rawOffsetQuote: string; relativeBetter: boolean } {
  const { ydoc, ytext } = createContentYText(params.content);
  const expected = params.content.slice(params.from, params.to);
  const anchor = createRelativeAnchor(ytext, params.from, params.to);

  ydoc.transact(() => {
    ytext.insert(params.insertAt, params.insertText);
  }, 'concurrent');

  const resolved = resolveRelativeAnchor(ydoc, anchor);
  const relativeQuote = resolved
    ? ytext.toString().slice(resolved.from, resolved.to)
    : '';

  const shift = params.insertAt <= params.from ? params.insertText.length : 0;
  const rawFrom = params.from; // stale raw offset (no shift) — wrong after insert-before
  const rawTo = params.to;
  const rawOffsetQuote = ytext.toString().slice(rawFrom, rawTo);

  // Also compare against naively shifted raw offsets vs relative
  void shift;
  return {
    relativeQuote,
    rawOffsetQuote,
    relativeBetter: relativeQuote === expected && rawOffsetQuote !== expected,
  };
}
