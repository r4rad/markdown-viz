# Changelog

All notable changes to MarkdownViz are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.1.0] — 2025-07-16

### Added
- **`/draw` slash command** — type `/draw` in the editor to insert a
  fenced diagram block via a CodeMirror autocomplete popup; choose
  Mermaid 🧜, Nomnoml 📦, or Graphviz DOT 🌐 from the list.
- **Inline diagram editor** — every rendered diagram in the preview pane
  now has an ✏️ Edit button that opens a Confluence-style panel below the
  diagram with a type selector dropdown, source textarea, live preview
  (300 ms debounce), and Apply/Cancel buttons.
- **What's New changelog modal** — auto-shows on first visit after a new
  release; re-accessible at any time via Settings → What's New.

### Fixed
- **Preview scroll position lost on tab switch** — switching between tabs
  now correctly restores the preview scroll offset (previously only the
  editor scroll was restored).

---

## [1.0.x] — 2025 (earlier)

Initial public beta releases. Features include:

- Live GitHub-flavored Markdown preview (marked + DOMPurify)
- CodeMirror 6 editor with syntax highlighting and Ctrl+F search
- Mermaid, Graphviz/DOT, Nomnoml diagram rendering with zoom/pan/export
- 17 themes (GitHub Light/Dark, VS Code, JetBrains, Dracula, Nord, …)
- Multi-tab sessions persisted to IndexedDB
- File import (`.md`, `.docx`, `.pdf`, `.txt`) and export (Markdown, HTML, PDF)
- KaTeX math rendering
- Markdown beautifier (Prettier with fallback)
- AI audio summaries (Groq LLM + extractive fallback + Kokoro TTS)
- Real-time CRDT collaboration via Firestore
- Cloud sync with GitHub/Google OAuth (Firebase Auth)
- Document sharing via URL
- Feedback modal with star rating and EmailJS delivery
- Status bar (line/col, words, chars, read time, sync status)
- Full keyboard shortcut set
- Responsive mobile layout with quick toolbar
