# MarkdownViz — Write Better. See It Live. Go Anywhere.

> **Try it now, free:** [markdown-viz.web.app](https://markdown-viz.web.app)
>
> 🚧 Currently in **Beta** — your feedback shapes what comes next.

---

## The Problem Nobody Talks About

Markdown is powerful. But writing it blind — typing syntax and hoping the output looks right — is exhausting.

You paste a table, scroll right, find a typo in the fourth column. Your `##` heading renders as a hash sign because you forgot the space. Your code block swallows the next paragraph. Your meticulously formatted document opens on your laptop and is completely gone on your work PC.

**MarkdownViz was built to fix all of that.**

---

## What MarkdownViz Does

It's a **live Markdown editor + rendered preview**, side by side, in your browser — no installation, no account required. Write on the left, see exactly what your readers will see on the right, in real time.

That's the core. Everything else is a bonus.

---

## Features That Actually Matter

### ✍️ Write with Confidence — See It Instantly

Your preview updates **as you type** — every word, every heading, every code block. No "compile" button. No refresh. No guessing.

The editor knows Markdown. Headings glow in their own colour. Bold text stands out from body text. Code blocks look like code blocks, not scrambled monospace. Every syntax element has a **distinct visual identity** so you always know what you're writing.

---

### 📂 Multiple Files, Zero Confusion

Work on several documents at once with **named tabs**. Rename any tab with a double-click (or long-press on mobile). Your tabs, their content, your cursor position, even your scroll offset — everything is **saved automatically** in your browser. Close the tab, reopen the app tomorrow, everything is exactly where you left it.

New tabs default to smart names (`untitled-1.md`, `untitled-2.md`) so your files never collide.

---

### 📐 Diagrams That Render Themselves

Stop screenshotting your Lucidchart. Stop pasting images that go stale. Write your diagram **in the same document**, as text, and it renders right there in the preview.

Three engines are supported:

| What you want | How to get it |
|---------------|--------------|
| Flowcharts, sequence diagrams, Gantt, ER | **Mermaid** — ` ```mermaid ` |
| Graph networks, dependency trees | **Graphviz DOT** — ` ```dot ` |
| Quick UML sketches | **Nomnoml** — ` ```nomnoml ` |

Every rendered diagram has a **zoom/pan modal** — click to open, scroll to zoom (up to 10×), drag to explore, then download as **PNG or SVG** in one click.

**New in v1.1.0 — `/draw` slash command**

Type `/draw` in the editor to bring up an autocomplete menu. Choose your diagram type and a ready-to-edit code block is inserted at the cursor:

```
/draw  →  [Mermaid 🧜, Nomnoml 📦, Graphviz DOT 🌐]
```

**New in v1.1.0 — Inline diagram editor (preview mode)**

Every diagram in the live preview now has an **✏️ Edit** button. Clicking it opens a Confluence-style panel right below the diagram:

- **Type dropdown** — switch between Mermaid, Nomnoml, and Graphviz DOT
- **Source textarea** — edit the diagram source directly
- **Live preview** — see the rendered result update as you type (300 ms debounce)
- **Apply** — replaces the code fence in your editor source
- **Cancel / Esc** — dismisses without saving

---

### 🧮 Math That Looks Like Math

LaTeX equations rendered beautifully via KaTeX — inline in a sentence or centered as a display block.

```
Inline:  The formula is $E = mc^2$ — simple.
Block:   $$\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$
```

No more typing `E = mc^2` and praying your readers can decode it.

---

### 🎨 17 Themes — Including the Ones You Already Know

Your editor should feel like home. Pick from themes inspired by the tools you already use:

**Light:** GitHub Light · Visual Studio · VS Code Light · JetBrains · IntelliJ · Paper · Solarized Light

**Dark:** GitHub Dark · VS Code Dark+ · JetBrains Darcula · One Dark · Dracula · Monokai · Nord · Solarized Dark · Tokyo Night · Catppuccin

Syntax colours — headings, bold, code, keywords, strings, comments — all adapt to the chosen theme. It's not just a colour swap; it's a complete visual environment.

---

### 📥 Bring Your Existing Documents

Already have a Word doc? A PDF someone sent you? A plain text file? **Import it.**

| Format | What happens |
|--------|-------------|
| `.md`, `.txt` | Opens instantly |
| `.docx` | Converted to clean Markdown (formatting preserved where possible) |
| `.pdf` | Text extracted and loaded as Markdown |
| `.doc`, `.odt`, `.rtf` | Best-effort plain text extraction |

**Three ways to import:** drag and drop onto the app, use the file picker, or paste a GitHub raw URL directly into the import dialog.

---

### 📤 Export in the Format You Need

Finished writing? Take it wherever you need it:

- **Export as Markdown** — the raw `.md` source, ready for GitHub, Notion, or your static site generator
- **Export as HTML** — a self-contained HTML file you can email, host, or embed. No external dependencies.
- **Export as PDF** — A4 portrait, auto-paginated. Great for documentation, reports, or anything that needs to print cleanly.

All exports use your **tab name as the filename** automatically.

---

### ☁️ Your Documents, On Every Device

Sign in with **GitHub** or **Google** and your documents follow you.

- **Ctrl+S** saves locally AND syncs to the cloud when you're signed in
- The **cloud sync button** (☁️) in the toolbar syncs on demand
- **Auto-sync** runs quietly every 60 seconds in the background (configurable)
- Rename a tab? The cloud copy renames itself automatically
- Load any cloud document to a new tab from the Settings panel

> **Beta plan:** Up to **5 documents** synced per account. Remove old ones to make room for new ones — you're always in control.
>
> No account needed to use the app. Sign in only if you want the cross-device sync.

---

### 🧹 One-Click Beautifier

Your Markdown is messy. Extra blank lines, inconsistent heading spacing, trailing spaces everywhere. Hit **Ctrl+Shift+F** (or the Beautify button) and Prettier formats your entire document instantly. Clean, consistent, professional.

---

### 📊 Know Your Document at a Glance

The status bar at the bottom always shows:
- **Ln · Col** — exactly where your cursor is
- **Words** — live word count
- **Chars** — character count
- **~N min read** — estimated reading time for your audience
- **Sync** — whether scroll sync is on or off

---

### ⌨️ Keyboard Shortcuts for Flow State

Stop reaching for the mouse. The most common formatting actions are one keypress away:

| Shortcut | What it does |
|----------|-------------|
| `Ctrl+B` | **Bold** selected text |
| `Ctrl+I` | *Italic* selected text |
| `Ctrl+K` | Insert [link] |
| `Ctrl+N` | Open a new tab |
| `Ctrl+S` | Save + sync to cloud |
| `Ctrl+Shift+F` | Beautify the whole document |
| `Ctrl+F` | Search in editor |
| `Double-click tab` | Rename the tab |

---

### 📱 Works on Your Phone Too

Not a stripped-down version. The full feature set.

- A quick toolbar at the top gives you **bold, italic, heading, link, list, table** in one tap
- The **Settings panel** has every other tool — import, export, themes, layout, rename, sign-in
- The split divider is **draggable on touch** — resize editor/preview with your finger
- Long-press a tab (600 ms) to rename it on mobile

---

### 🔒 Your Data Is Yours

- **Offline-first** — everything is stored in your browser's IndexedDB. No network needed to use the app.
- **No tracking** — no analytics, no third-party scripts beyond Firebase (only used for auth and sync when you choose to sign in)
- **Open source** — GPL-3.0 licensed. Read the code, fork it, run it yourself.

---

### 📣 What's New — Changelog

**First visit after a release?** A "What's New" popup appears automatically (600 ms after the app loads) listing everything that changed in the current version. Dismiss it once and it won't show again until the next release.

**Want to see it again?** Settings → **What's New** re-opens the modal at any time.

---

Write a `[Link to section](#my-section)` in your document and clicking it in the preview **scrolls directly to that heading** — perfectly positioned, no overshoot. Works for any depth of heading, any document length.

---

### ✅ GitHub-Style Task Lists & Alerts

Your preview renders exactly what GitHub renders:

```markdown
- [x] Done task
- [ ] Pending task

> [!NOTE]
> Something worth knowing.

> [!WARNING]
> Watch out for this.
```

Alerts render as coloured callout boxes with matching icons. Task lists render with real checkboxes.

---

### 😄 Emoji Shortcodes

Because typing `:rocket:` is faster than finding 🚀 in a picker.

Supported: `:rocket:` :rocket: · `:fire:` :fire: · `:+1:` :+1: · `:tada:` :tada: · `:warning:` :warning: · `:bulb:` :bulb: · and 40+ more.

---

## Honest Limitations (Beta)

We'd rather tell you upfront than have you discover it yourself:

| Limitation | Status |
|------------|--------|
| Max 5 cloud-synced documents (free beta tier) | By design — will expand in future tiers |
| PDF export is raster-based (not vector text) | Known; vector PDF is on the roadmap |
| No real-time collaboration | Not planned for current scope |
| DOCX import preserves most formatting; complex layouts may simplify | Known limitation of mammoth.js |
| `.doc`, `.odt`, `.rtf` import is best-effort (plain text only) | Known |

---

## Tell Us What You Think

Every piece of feedback shapes the next version. Hit the **Feedback** button in Settings — rate the app, describe what you love or what's broken. Logged-in users don't even need to fill in their name or email.

**Built by [r4rad](https://rafatahmad.com) 🐙**

---

*MarkdownViz is open source (GPL-3.0). Contributions welcome.*
