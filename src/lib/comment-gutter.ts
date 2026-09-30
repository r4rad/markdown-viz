import {
  EditorView,
  GutterMarker,
  gutter,
  Decoration,
  type DecorationSet,
} from '@codemirror/view';
import {
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Extension,
} from '@codemirror/state';
import type { CommentThread } from '../types';
import {
  createContentYText,
  isYjsRelativeAnchor,
  resolveRelativeAnchor,
} from './comment-anchors';

export interface CommentGutterMark {
  threadId: string;
  line: number;
  resolved: boolean;
  quote: string;
}

export const setCommentMarks = StateEffect.define<CommentGutterMark[]>();

class CommentGutterWidget extends GutterMarker {
  constructor(
    readonly threadId: string,
    readonly resolved: boolean,
  ) {
    super();
  }

  eq(other: CommentGutterWidget): boolean {
    return other.threadId === this.threadId && other.resolved === this.resolved;
  }

  toDOM(): HTMLElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = this.resolved
      ? 'cm-comment-gutter cm-comment-gutter-resolved'
      : 'cm-comment-gutter';
    el.title = this.resolved ? 'Resolved comment' : 'Open comment thread';
    el.dataset.threadId = this.threadId;
    el.textContent = this.resolved ? '✓' : '•';
    el.setAttribute('aria-label', el.title);
    return el;
  }
}

/** Map threads to gutter line numbers using Yjs-relative anchors against current content. */
export function threadsToGutterMarks(
  threads: CommentThread[],
  content: string,
): CommentGutterMark[] {
  const { ydoc } = createContentYText(content);
  const marks: CommentGutterMark[] = [];
  const lines = content.split('\n');

  for (const thread of threads) {
    const resolvedPos = resolveRelativeAnchor(ydoc, thread.anchor);
    let index = 0;
    if (resolvedPos) {
      index = resolvedPos.from;
    } else if (isYjsRelativeAnchor(thread.anchor) && typeof thread.anchor.fromHint === 'number') {
      index = thread.anchor.fromHint;
    }
    let line = 1;
    let remaining = index;
    for (let i = 0; i < lines.length; i++) {
      if (remaining <= lines[i].length) {
        line = i + 1;
        break;
      }
      remaining -= lines[i].length + (i < lines.length - 1 ? 1 : 0);
      line = i + 1;
    }
    marks.push({
      threadId: thread.id,
      line,
      resolved: thread.resolved,
      quote: thread.quote,
    });
  }
  return marks;
}

function buildHighlightDecorations(
  marks: CommentGutterMark[],
  doc: { line: (n: number) => { from: number }; lines: number },
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const sorted = [...marks].filter(m => !m.resolved).sort((a, b) => a.line - b.line);
  for (const mark of sorted) {
    if (mark.line < 1 || mark.line > doc.lines) continue;
    const line = doc.line(mark.line);
    builder.add(
      line.from,
      line.from,
      Decoration.line({
        class: 'cm-comment-line',
        attributes: { 'data-comment-thread': mark.threadId },
      }),
    );
  }
  return builder.finish();
}

const commentMarksField = StateField.define<CommentGutterMark[]>({
  create() {
    return [];
  },
  update(marks, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCommentMarks)) return effect.value;
    }
    return marks;
  },
});

const commentHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCommentMarks)) {
        return buildHighlightDecorations(effect.value, tr.state.doc);
      }
    }
    if (tr.docChanged) return deco.map(tr.changes);
    return deco;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const commentGutterExt = gutter({
  class: 'cm-comment-gutter-col',
  markers(view) {
    const marks = view.state.field(commentMarksField);
    const builder = new RangeSetBuilder<GutterMarker>();
    const sorted = [...marks].sort((a, b) => a.line - b.line);
    for (const mark of sorted) {
      if (mark.line < 1 || mark.line > view.state.doc.lines) continue;
      const line = view.state.doc.line(mark.line);
      builder.add(line.from, line.from, new CommentGutterWidget(mark.threadId, mark.resolved));
    }
    return builder.finish();
  },
  initialSpacer: () => new CommentGutterWidget('', true),
});

/** CodeMirror extension: comment gutter marks + line highlights. */
export function commentGutterExtension(): Extension {
  return [commentMarksField, commentHighlightField, commentGutterExt];
}
