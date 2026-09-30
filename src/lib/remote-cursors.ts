import { EditorView, Decoration, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField, type Extension, type Range } from '@codemirror/state';
import type { PresencePeer } from '../types';

class RemoteCursorWidget extends WidgetType {
  constructor(
    readonly color: string,
    readonly name: string,
  ) {
    super();
  }

  eq(other: RemoteCursorWidget): boolean {
    return other.color === this.color && other.name === this.name;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-remote-cursor';
    wrap.style.setProperty('--remote-cursor-color', this.color);
    wrap.title = this.name;
    wrap.setAttribute('aria-hidden', 'true');

    const caret = document.createElement('span');
    caret.className = 'cm-remote-cursor-caret';

    const label = document.createElement('span');
    label.className = 'cm-remote-cursor-label';
    label.textContent = this.name;
    label.style.background = this.color;

    wrap.append(caret, label);
    return wrap;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export const setRemotePresence = StateEffect.define<PresencePeer[]>();

function clamp(pos: number, docLen: number): number {
  return Math.max(0, Math.min(pos, docLen));
}

/** Build CodeMirror decorations for remote peer cursors/selections. */
export function buildRemoteCursorDecorations(
  peers: PresencePeer[],
  docLen: number,
): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const peer of peers) {
    const sel = peer.selection ?? peer.cursor;
    if (!sel) continue;

    const from = clamp(Math.min(sel.anchor, sel.head), docLen);
    const to = clamp(Math.max(sel.anchor, sel.head), docLen);
    const head = clamp(sel.head, docLen);

    if (to > from) {
      ranges.push(
        Decoration.mark({
          class: 'cm-remote-selection',
          attributes: {
            style: `background: color-mix(in srgb, ${peer.color} 28%, transparent)`,
          },
        }).range(from, to),
      );
    }

    ranges.push(
      Decoration.widget({
        widget: new RemoteCursorWidget(peer.color, peer.displayName),
        side: 1,
      }).range(head),
    );
  }

  return Decoration.set(ranges, true);
}

const remotePresenceField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setRemotePresence)) {
        return buildRemoteCursorDecorations(effect.value, tr.state.doc.length);
      }
    }
    if (tr.docChanged) return deco.map(tr.changes);
    return deco;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** CodeMirror extension: remote cursors driven by `setRemotePresence` effects. */
export function remotePresenceExtension(): Extension {
  return remotePresenceField;
}
