# MarkdownViz

A zero-framework, performance-oriented Markdown editor, live preview, and beautifier with multi-tab sessions, diagram support, rich file conversion, and optional cloud sync — built entirely in vanilla TypeScript with Vite.

> **Live app**: https://markdown-viz.web.app

---

## ✨ Feature Overview

### Editor & Preview
- **CodeMirror 6 editor** — line numbers, code folding, bracket matching, full undo/redo history, Ctrl+F search
- **Live GitHub-flavored preview** — updates as you type (150ms debounce), sanitized via DOMPurify
- **Draggable split divider** — resize editor/preview panes with mouse or touch on all devices (min 15%, max 85%)
- **Sync scroll** — proportional bidirectional scroll locking between editor and preview
- **Distinctive syntax highlighting** — theme-aware colors for headings H1–H6, bold, italic, inline code, links, lists, fences
- **Markdown beautifier** — one-click Prettier formatting (`Ctrl+Shift+F`); fallback to basic formatter if Prettier fails

### Rendering Engine
- **GitHub Alerts** — `[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!IMPORTANT]`, `[!CAUTION]` rendered as colored callout boxes
- **Math** — KaTeX for inline (`$...$`) and block (`$$...$$`) LaTeX (lazy-loaded on first use)
- **Syntax-highlighted code blocks** — highlight.js, 190+ languages, lazy-loaded
- **Emoji shortcodes** — 50+ codes: `:rocket:` → 🚀, `:fire:` → 🔥, `:+1:` → 👍
- **Smart heading anchors** — auto-generated IDs; duplicate headings numbered (`-1`, `-2`)
- **TOC click-scroll** — clicking any `[text](#anchor)` link in preview smoothly scrolls to that heading

### Diagram Support
| Engine | Code fence | What it renders |
|--------|-----------|----------------|
| [Mermaid](https://mermaid.js.org/) | ` ```mermaid ` | Flowcharts, sequence, Gantt, class, state, ER, pie, gitGraph |
| [Graphviz/DOT](https://viz-js.com/) | ` ```dot ` / ` ```graphviz ` | DOT language graphs (WASM) |
| [Nomnoml](https://nomnoml.com/) | ` ```nomnoml ` | Simple UML diagrams |

All diagrams include a **zoom/pan modal** (scroll to zoom, drag to pan) and **PNG/SVG export**.

### Themes (17 built-in)
| Light | Dark |
|-------|------|
| GitHub Light | GitHub Dark |
| Visual Studio | VS Code Dark+ |
| VS Code Light | JetBrains Darcula |
| JetBrains | One Dark |
| IntelliJ | Dracula |
| Paper | Monokai |
| Solarized Light | Nord |
| | Solarized Dark |
| | Tokyo Night |
| | Catppuccin |

All themes ship with configurable syntax-color CSS variables (`--mk-heading`, `--mk-bold`, `--mk-code`, etc.).

### Tabs
- **Multi-tab** — unlimited tabs, all persisted to IndexedDB
- **Auto-naming** — new tabs default to `untitled-1.md`, `untitled-2.md`, …
- **Inline rename** — double-click (desktop) or long-press 600 ms (mobile) on the tab label
- **Rename from Settings** — Settings → File → rename input → Rename button
- **Dirty indicator** — dot on tab when unsaved changes exist
- **Download uses tab name** as filename

### File Import / Export
**Import** — drag & drop, file picker, or paste a GitHub raw URL:
| Format | How |
|--------|-----|
| `.md`, `.markdown`, `.mdx`, `.txt` | Direct load |
| `.pdf` | Text extraction via pdf.js |
| `.docx` | HTML → Markdown via mammoth.js |
| `.doc`, `.odt`, `.rtf` | Best-effort text extraction |

**Export**:
- **Markdown** — raw `.md` source, tab name as filename
- **HTML** — self-contained HTML with inline styles, no external CDN required at read time
- **PDF** — html2canvas + jsPDF, A4 portrait, auto-paginated

### Cloud Sync & Auth
- **Optional** — the entire app works offline without any account
- **Providers** — GitHub OAuth, Google OAuth (via Firebase Auth)
- **Storage** — Firestore; up to `VITE_MAX_SYNC_TABS` docs per account (default: 5)
- **Ctrl+S** — saves locally AND syncs to cloud when signed in
- **Cloud sync button** — toolbar button (☁️) visible when signed in
- **Auto-sync** — runs every `VITE_AUTO_SYNC_INTERVAL_SECONDS` seconds (default: 60) for signed-in users
- **Tab rename sync** — renaming a tab updates its Firestore document name automatically
- **Load from cloud** — restore any cloud document to a new tab via Settings
- **Delete from cloud** — remove individual documents from Settings
- **Profile** — avatar visible in top bar when signed in; all auth controls in Settings

### Status Bar
Real-time document stats at the bottom of the screen:
- Line number, column, word count, character count, estimated reading time, sync-scroll status

### Feedback
- **Settings → Feedback** — star rating (1–5), name/email (auto-filled when signed in), message
- **Stored in Firestore** `feedback` collection
- **Email delivery** via EmailJS (optional — requires `VITE_EMAILJS_*` env vars)

### Mobile & Responsive
- **Settings gear** — all features accessible via slide-in settings panel on mobile
- **Quick toolbar** — bold, italic, heading, link, list, table on top bar for fast access
- **Full toolbar in Settings** — all formatting and export actions available
- **Long-press rename** — 600 ms long-press on tab label triggers rename on mobile
- **Auth in Settings** — sign-in/profile/cloud docs all in Settings on mobile

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests (137 tests, 9 files)
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## 🔑 Firebase Setup (Optional)

Cloud sync requires a Firebase project. Without it the app works fully offline.

1. Create a project at [Firebase Console](https://console.firebase.google.com/)
2. **Authentication** → Sign-in providers → enable **GitHub** and **Google**
3. **Cloud Firestore** → create database (start in test mode, then deploy rules below)
4. **Project Settings** → Your apps → Web app → copy config
5. Create `.env.local` (never commit this file):

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

6. Deploy Firestore security rules:
```bash
firebase deploy --only firestore
```

The included `firestore.rules` enforces user-scoped access:
- `/users/{uid}/files/{fileId}` — only the owning user can read/write
- `/feedback/{docId}` — public create, no read/update/delete

### Optional: EmailJS for feedback email delivery

```env
VITE_EMAILJS_SERVICE_ID=service_xxx
VITE_EMAILJS_TEMPLATE_ID=template_xxx
VITE_EMAILJS_PUBLIC_KEY=abc123
VITE_FEEDBACK_EMAIL=you@example.com
```

All three `VITE_EMAILJS_*` vars must be set; missing any silently disables email (Firestore write still happens).

---

## ⚙️ Environment Variables

All variables are optional. Copy `.env.example` to `.env.local` and override what you need.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_FIREBASE_API_KEY` | — | Firebase project API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | — | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | — | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | — | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | — | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | — | Firebase app ID |
| `VITE_MAX_SYNC_TABS` | `5` | Max documents synced per user account |
| `VITE_AUTO_SYNC_INTERVAL_SECONDS` | `60` | Auto-sync interval for signed-in users (seconds) |
| `VITE_EMAILJS_SERVICE_ID` | — | EmailJS service ID (feedback email) |
| `VITE_EMAILJS_TEMPLATE_ID` | — | EmailJS template ID (feedback email) |
| `VITE_EMAILJS_PUBLIC_KEY` | — | EmailJS public key |
| `VITE_FEEDBACK_EMAIL` | `rad.rafatahmad@gmail.com` | Recipient address for feedback emails |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+K` | Insert link |
| `Ctrl+N` | New tab |
| `Ctrl+S` | Save locally + sync to cloud (if signed in) |
| `Ctrl+Shift+F` | Beautify markdown |
| `Ctrl+F` | Search in editor (CodeMirror native) |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Escape` | Close modal / cancel tab rename |
| Double-click tab | Rename tab (inline) |
| Long-press tab (600 ms) | Rename tab on mobile |

---

## 🛠️ Tech Stack

| Library | Version | Purpose | Loading |
|---------|---------|---------|---------|
| [Vite](https://vite.dev/) | 6.x | Build tool & dev server | Core |
| [TypeScript](https://www.typescriptlang.org/) | 5.x | Type safety | Core |
| [CodeMirror 6](https://codemirror.net/) | 6.x | Editor engine | Bundled |
| [marked](https://marked.js.org/) | 17.x | Markdown parser | Bundled |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.x | HTML sanitization | Bundled |
| [highlight.js](https://highlightjs.org/) | 11.x | Code block highlighting | Lazy |
| [KaTeX](https://katex.org/) | 0.16.x | LaTeX math rendering | Lazy |
| [Mermaid](https://mermaid.js.org/) | 11.x | Mermaid diagrams | Lazy |
| [@viz-js/viz](https://viz-js.com/) | 3.x | Graphviz/DOT (WASM) | Lazy |
| [nomnoml](https://nomnoml.com/) | 1.x | UML diagrams | Lazy |
| [Prettier](https://prettier.io/) | 3.x | Markdown beautifier | Lazy |
| [Firebase](https://firebase.google.com/) | 11.x | Auth + Firestore sync | Lazy |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | 1.x | DOCX → Markdown | Lazy |
| [pdfjs-dist](https://github.com/nicnils/pdfjs-dist) | 4.x | PDF text extraction | Lazy |
| [html2canvas](https://html2canvas.hertzen.com/) | 1.x | Preview → canvas for PDF | Lazy |
| [jsPDF](https://github.com/parallax/jsPDF) | 2.x | PDF generation | Lazy |
| [@emailjs/browser](https://www.emailjs.com/) | 4.x | Feedback email delivery | Lazy |
| [Vitest](https://vitest.dev/) | 4.x | Testing framework | Dev |

All heavy libraries are **lazy-loaded** on first use — initial JS payload is small.

---

## 🗂️ Project Structure

```
src/
  components/       # UI components (App, Toolbar, TabBar, Editor, Preview, …)
  lib/              # Business logic (state, events, auth, import, export, feedback, …)
  themes/           # Theme definitions and CSS variable maps
  styles/           # layout.css — all component styles
  types.ts          # Shared TypeScript interfaces (FileTab, AppState, UserProfile, …)
  main.ts           # Entry point

tests/              # Vitest test files (unit, integration, smoke, regression)
firestore.rules     # Firestore security rules
firebase.json       # Firebase hosting + firestore config
.env.example        # All supported environment variables with comments
agentrefdocs/       # Developer reference docs and sample Markdown (gitignored)
```

---

## 📱 Responsive Breakpoints

| Viewport | Layout | Notes |
|---------|--------|-------|
| > 768 px | Side-by-side editor + preview | Draggable vertical split handle |
| ≤ 768 px | Stacked vertically | Draggable horizontal split handle; auth/tools in Settings |

---

## 🧪 Testing

```bash
npm test              # Run all 137 tests (9 files)
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

**Test coverage:**
| File | Type | Focus |
|------|------|-------|
| `tests/state.test.ts` | Unit + Integration | State management, tab operations, events |
| `tests/events.test.ts` | Unit | Event bus subscribe/emit/unsubscribe |
| `tests/themes.test.ts` | Unit | Theme definitions, CSS variable completeness |
| `tests/icons.test.ts` | Unit | Icon registry — all icons render valid SVG |
| `tests/import.test.ts` | Unit + Edge | File import, format detection, conversion |
| `tests/smoke.test.ts` | Smoke | Module loading, Firebase config, app init |
| `tests/beautifier.test.ts` | Unit + Regression | Prettier + fallback beautifier edge cases |
| `tests/feedback.test.ts` | Unit | Feedback submission, Firestore, email fallback |
| `tests/types.test.ts` | Unit | TypeScript interface shape validation |

---

## 🚢 Deploy

```bash
# Deploy hosting only
npm run build && firebase deploy --only hosting

# Deploy hosting + Firestore rules
npm run build && firebase deploy
```

Chunk-size warnings for `viz.js` (~1.4 MB) and `editor.js` (~633 KB) are expected and acceptable — both are lazy-loaded or code-split by Vite.

---

## 📄 License

GNU General Public License v3.0

