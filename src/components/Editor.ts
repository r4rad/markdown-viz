import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, highlightActiveLine } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle, foldGutter, foldKeymap, HighlightStyle } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import { getActiveTab, updateTabContent, updateTabCursor, getState } from '../lib/state';
import { on, emit } from '../lib/events';
import { DIAGRAM_TYPES, DIAGRAM_LABELS, getDrawTemplate } from '../lib/draw-command';
import type { FileTab } from '../types';

let view: EditorView | null = null;
let editorContainer: HTMLElement | null = null;
let ignoreNextUpdate = false;
let ignoreEditorScroll = false;

// ─── /draw slash-command completion ───────────────────────────────────────────

const DRAW_EMOJI: Record<string, string> = {
  mermaid: '🔷',
  nomnoml: '📐',
  dot:     '🕸️',
};

function drawCompletionSource(context: CompletionContext): CompletionResult | null {
  // Match a /draw token at the cursor (possibly partially typed)
  const word = context.matchBefore(/\/\w*/);
  if (!word) return null;
  if (!word.text.startsWith('/draw') && !/^\/d(r(a(w?)?)?)?$/.test(word.text)) return null;
  if (word.text.length < 2) return null;

  return {
    from: word.from,
    options: DIAGRAM_TYPES.map((type) => ({
      label:  `/draw:${type}`,
      displayLabel: `${DRAW_EMOJI[type]} ${DIAGRAM_LABELS[type]}`,
      detail: 'Insert diagram block',
      type:   'keyword',
      apply(editorView, _completion, from, to) {
        const template = getDrawTemplate(type);
        editorView.dispatch({
          changes: { from, to, insert: template },
          // Place cursor inside the code fence content area
          selection: { anchor: from + template.indexOf('\n', 1) + 1 },
        });
        editorView.focus();
      },
    })),
    validFor: /^\/\w*$/,
  };
}

function createEditorTheme(): Extension {
  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '13px',
    },
    '.cm-scroller': {
      fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
      overflow: 'auto',
    },
    '.cm-content': {
      caretColor: 'var(--accent)',
      padding: '8px 0',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--accent)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      background: 'color-mix(in srgb, var(--accent) 25%, transparent) !important',
    },
    '.cm-activeLine': {
      background: 'color-mix(in srgb, var(--accent) 5%, transparent)',
    },
    '.cm-activeLineGutter': {
      background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
    },
    '.cm-gutters': {
      background: 'var(--bg-editor)',
      color: 'var(--text-muted)',
      border: 'none',
      borderRight: '1px solid var(--border-secondary)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px 0 12px',
      minWidth: '32px',
    },
    '.cm-foldGutter .cm-gutterElement': {
      padding: '0 4px',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-matchingBracket': {
      background: 'color-mix(in srgb, var(--accent) 20%, transparent)',
      outline: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
    },
    '.cm-searchMatch': {
      background: 'color-mix(in srgb, var(--warning) 30%, transparent)',
    },
    '.cm-tooltip': {
      background: 'var(--bg-dropdown)',
      border: '1px solid var(--border-primary)',
      borderRadius: '4px',
    },
    '.cm-tooltip-autocomplete ul li': {
      padding: '2px 8px',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      background: 'var(--bg-active)',
    },
  });
}

function createSyntaxHighlightStyle(): Extension {
  const style = HighlightStyle.define([
    { tag: tags.keyword, color: 'var(--syntax-keyword)' },
    { tag: tags.string, color: 'var(--syntax-string)' },
    { tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
    { tag: tags.function(tags.variableName), color: 'var(--syntax-function)' },
    { tag: tags.definition(tags.variableName), color: 'var(--syntax-function)' },
    { tag: tags.variableName, color: 'var(--syntax-variable)' },
    { tag: tags.number, color: 'var(--syntax-number)' },
    { tag: tags.integer, color: 'var(--syntax-number)' },
    { tag: tags.float, color: 'var(--syntax-number)' },
    { tag: tags.bool, color: 'var(--syntax-keyword)' },
    { tag: tags.operator, color: 'var(--syntax-keyword)' },
    { tag: tags.typeName, color: 'var(--syntax-function)' },
    { tag: tags.className, color: 'var(--syntax-function)' },
    { tag: tags.propertyName, color: 'var(--syntax-variable)' },
    { tag: tags.url, color: 'var(--syntax-url)', textDecoration: 'underline' },
    { tag: tags.link, color: 'var(--syntax-url)' },
    { tag: tags.heading, color: 'var(--syntax-heading)', fontWeight: 'bold' },
    { tag: tags.heading1, color: 'var(--syntax-heading)', fontWeight: 'bold', fontSize: '1.3em' },
    { tag: tags.heading2, color: 'var(--syntax-heading)', fontWeight: 'bold', fontSize: '1.2em' },
    { tag: tags.heading3, color: 'var(--syntax-heading)', fontWeight: 'bold', fontSize: '1.1em' },
    { tag: tags.strong, color: 'var(--syntax-bold)', fontWeight: 'bold' },
    { tag: tags.emphasis, color: 'var(--syntax-italic)', fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--syntax-comment)' },
    { tag: tags.monospace, color: 'var(--syntax-string)', fontFamily: "'SFMono-Regular', Consolas, monospace" },
    { tag: tags.quote, color: 'var(--syntax-comment)', fontStyle: 'italic' },
    { tag: tags.meta, color: 'var(--syntax-comment)' },
    { tag: tags.tagName, color: 'var(--syntax-keyword)' },
    { tag: tags.attributeName, color: 'var(--syntax-function)' },
    { tag: tags.attributeValue, color: 'var(--syntax-string)' },
    { tag: tags.processingInstruction, color: 'var(--syntax-keyword)' },
    { tag: tags.atom, color: 'var(--syntax-number)' },
    { tag: tags.regexp, color: 'var(--syntax-string)' },
    { tag: tags.escape, color: 'var(--syntax-number)' },
    { tag: tags.null, color: 'var(--syntax-keyword)' },
    { tag: tags.self, color: 'var(--syntax-keyword)' },
    { tag: tags.separator, color: 'var(--syntax-comment)' },
    { tag: tags.special(tags.string), color: 'var(--syntax-string)' },
  ]);
  return syntaxHighlighting(style);
}

function getExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    createSyntaxHighlightStyle(),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ override: [drawCompletionSource] }),
    rectangularSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
    ]),
    createEditorTheme(),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !ignoreNextUpdate) {
        const tab = getActiveTab();
        if (tab) {
          const content = update.state.doc.toString();
          updateTabContent(tab.id, content);
        }
      }
      ignoreNextUpdate = false;

      if (update.selectionSet || update.docChanged) {
        const tab = getActiveTab();
        if (tab) {
          const pos = update.state.selection.main.head;
          const scrollTop = update.view.scrollDOM.scrollTop;
          updateTabCursor(tab.id, pos, scrollTop);
          const line = update.state.doc.lineAt(pos);
          emit('cursor-changed', { line: line.number, col: pos - line.from + 1 });
        }
      }
    }),
    EditorView.domEventHandlers({
      scroll: (_, v) => {
        if (getState().syncScroll && !ignoreEditorScroll) {
          const scrollInfo = v.scrollDOM;
          const ratio = scrollInfo.scrollTop / (scrollInfo.scrollHeight - scrollInfo.clientHeight || 1);
          emit('editor-scroll', ratio);
        }
      },
    }),
    EditorView.lineWrapping,
  ];
}

export function createEditor(): HTMLElement {
  editorContainer = document.createElement('div');
  editorContainer.className = 'editor-pane';
  editorContainer.id = 'editor-pane';

  const tab = getActiveTab();
  view = new EditorView({
    state: EditorState.create({
      doc: tab?.content ?? '',
      extensions: getExtensions(),
    }),
    parent: editorContainer,
  });

  on('active-tab-changed', (tab: unknown) => loadTab(tab as FileTab | null));
  on('state-restored', () => {
    const tab = getActiveTab();
    if (tab) loadTab(tab);
  });

  on('toolbar-action', (action: unknown) => {
    handleToolbarAction(action as string);
  });

  on('set-editor-content', (content: unknown) => {
    if (view) {
      ignoreNextUpdate = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content as string },
      });
    }
  });

  on('crdt-remote-update', (content: unknown) => {
    if (!view) return;
    const curPos = view.state.selection.main.head;
    const newContent = content as string;
    ignoreNextUpdate = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newContent },
    });
    try {
      const clampedPos = Math.min(curPos, newContent.length);
      view.dispatch({ selection: { anchor: clampedPos } });
    } catch {
      // ignore invalid cursor after remote replace
    }
  });

  on('layout-changed', () => {
    requestAnimationFrame(() => view?.requestMeasure());
  });

  // Bidirectional sync: scroll editor when preview scrolls
  on('preview-scroll', (ratio: unknown) => {
    if (!view || !getState().syncScroll) return;
    ignoreEditorScroll = true;
    const sd = view.scrollDOM;
    sd.scrollTop = (ratio as number) * (sd.scrollHeight - sd.clientHeight);
    requestAnimationFrame(() => { ignoreEditorScroll = false; });
  });

  return editorContainer;
}

function loadTab(tab: FileTab | null): void {
  if (!view || !tab) return;
  ignoreNextUpdate = true;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: tab.content },
  });
  try {
    const pos = Math.min(tab.cursorPos, tab.content.length);
    view.dispatch({ selection: { anchor: pos } });
    view.scrollDOM.scrollTop = tab.scrollTop;
  } catch {
    // ignore invalid cursor
  }
  view.focus();
}

function handleToolbarAction(action: string): void {
  if (!view) return;
  const { state } = view;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to);

  const wrapWith = (before: string, after: string, placeholder: string) => {
    if (selected) {
      view!.dispatch({
        changes: { from: range.from, to: range.to, insert: `${before}${selected}${after}` },
        selection: { anchor: range.from + before.length, head: range.from + before.length + selected.length },
      });
    } else {
      view!.dispatch({
        changes: { from: range.from, insert: `${before}${placeholder}${after}` },
        selection: { anchor: range.from + before.length, head: range.from + before.length + placeholder.length },
      });
    }
    view!.focus();
  };

  const insertAtLineStart = (prefix: string) => {
    const line = state.doc.lineAt(range.from);
    view!.dispatch({
      changes: { from: line.from, to: line.from, insert: prefix },
    });
    view!.focus();
  };

  switch (action) {
    case 'bold': wrapWith('**', '**', 'bold text'); break;
    case 'italic': wrapWith('_', '_', 'italic text'); break;
    case 'code': wrapWith('`', '`', 'code'); break;
    case 'link': wrapWith('[', '](url)', 'link text'); break;
    case 'image': wrapWith('![', '](url)', 'alt text'); break;
    case 'heading': insertAtLineStart('## '); break;
    case 'quote': insertAtLineStart('> '); break;
    case 'list': insertAtLineStart('- '); break;
    case 'checklist': insertAtLineStart('- [ ] '); break;
    case 'hr':
      view.dispatch({
        changes: { from: range.from, insert: '\n---\n' },
      });
      view.focus();
      break;
    case 'table':
      view.dispatch({
        changes: {
          from: range.from,
          insert: '\n| Header 1 | Header 2 | Header 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n| Cell 4   | Cell 5   | Cell 6   |\n',
        },
      });
      view.focus();
      break;
    case 'beautify':
      emit('beautify');
      break;
  }
}

export function getEditorView(): EditorView | null {
  return view;
}

export function getEditorScrollRatio(): number {
  if (!view) return 0;
  const sd = view.scrollDOM;
  return sd.scrollTop / (sd.scrollHeight - sd.clientHeight || 1);
}
