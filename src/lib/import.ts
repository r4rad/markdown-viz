import { emit } from './events';
import { htmlToMarkdown } from './html-to-markdown';
import { buildPdfMarkdown, pdfTextItemsToLines } from './pdf-text';
import { isMarkdownPath } from './workspace';

export type DirectoryImportFile = {
  /** Path relative to the selected root folder, using `/` separators. */
  relativePath: string;
  content: string;
};

export type DirectoryImportPayload = {
  rootName: string;
  files: DirectoryImportFile[];
};

export function setupImport(): void {
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (files?.length) {
      handleFile(files[0]);
    }
  });

  emit('import-ready');
}

const SUPPORTED_EXTENSIONS = '.md,.markdown,.txt,.text,.mdx,.pdf,.doc,.docx,.odt,.rtf';

/** True when a file name or relative path is markdown-only for folder import. */
export function isMarkdownImportPath(path: string): boolean {
  return isMarkdownPath(path);
}

/** Keep only `.md` / `.mdx` / `.markdown` paths (case-insensitive). */
export function filterMarkdownRelativePaths(paths: string[]): string[] {
  return paths.filter(isMarkdownImportPath);
}

export function openFilePicker(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = SUPPORTED_EXTENSIONS;
  input.addEventListener('change', () => {
    if (input.files?.length) {
      handleFile(input.files[0]);
    }
  });
  input.click();
}

/**
 * One-shot browser directory import (no continuous disk sync).
 * Chromium: showDirectoryPicker; fallback: &lt;input webkitdirectory&gt;.
 */
export async function openDirectoryImport(): Promise<void> {
  const picker = (window as Window & {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker;

  if (typeof picker === 'function') {
    try {
      const root = await picker.call(window, { mode: 'read' });
      const files = await walkDirectoryHandle(root);
      emit('directory-imported', { rootName: root.name, files } satisfies DirectoryImportPayload);
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      console.warn('showDirectoryPicker failed; falling back to webkitdirectory', err);
    }
  }

  openWebkitDirectoryPicker();
}

function openWebkitDirectoryPicker(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.setAttribute('webkitdirectory', '');
  input.setAttribute('directory', '');
  input.addEventListener('change', () => {
    void (async () => {
      if (!input.files?.length) return;
      const payload = await filesFromFileList(input.files);
      if (payload) emit('directory-imported', payload);
    })();
  });
  input.click();
}

/** DOM typings omit async iterators on FileSystemDirectoryHandle in some TS targets. */
type DirectoryHandleIterable = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>;
};

async function walkDirectoryHandle(
  dir: FileSystemDirectoryHandle,
  prefix = '',
): Promise<DirectoryImportFile[]> {
  const out: DirectoryImportFile[] = [];
  for await (const handle of (dir as DirectoryHandleIterable).values()) {
    const name = handle.name;
    const rel = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      out.push(...await walkDirectoryHandle(handle as FileSystemDirectoryHandle, rel));
    } else if (handle.kind === 'file' && isMarkdownImportPath(name)) {
      const file = await (handle as FileSystemFileHandle).getFile();
      out.push({
        relativePath: rel.replace(/\\/g, '/'),
        content: await readFileAsText(file),
      });
    }
  }
  return out;
}

async function filesFromFileList(fileList: FileList): Promise<DirectoryImportPayload | null> {
  const all = Array.from(fileList);
  if (!all.length) return null;

  const firstRel = relativePathOf(all[0]);
  const rootName = firstRel.split('/')[0] || 'Imported';
  const files: DirectoryImportFile[] = [];

  for (const file of all) {
    const full = relativePathOf(file).replace(/\\/g, '/');
    if (!isMarkdownImportPath(full)) continue;
    const parts = full.split('/');
    const within = parts[0] === rootName ? parts.slice(1).join('/') : full;
    if (!within || !isMarkdownImportPath(within)) continue;
    files.push({
      relativePath: within,
      content: await readFileAsText(file),
    });
  }

  return { rootName, files };
}

function relativePathOf(file: File): string {
  const withRel = file as File & { webkitRelativePath?: string };
  return withRel.webkitRelativePath || file.name;
}

async function handleFile(file: File): Promise<void> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const baseName = file.name.replace(/\.[^.]+$/, '');

  try {
    let content: string;

    if (ext === 'pdf') {
      content = await convertPdfToMarkdown(file);
    } else if (ext === 'docx') {
      content = await convertDocxToMarkdown(file);
    } else if (ext === 'doc') {
      throw new Error(
        'Legacy .doc (Word 97–2003) is not supported in the browser. Save as .docx or .pdf and import again.',
      );
    } else if (ext === 'odt' || ext === 'rtf') {
      content = await convertRichTextFallback(file, ext);
    } else {
      // Plain text / markdown files
      content = await readFileAsText(file);
    }

    const name = baseName + '.md';
    emit('file-imported', { name, content });
  } catch (err) {
    console.error(`Import failed for ${file.name}:`, err);
    // Binary formats must not fall back to FileReader text (garbage / mojibake)
    if (ext === 'pdf' || ext === 'docx' || ext === 'doc' || ext === 'odt') {
      alert(`Failed to import ${file.name}: ${err}`);
      return;
    }
    try {
      const fallback = await readFileAsText(file);
      emit('file-imported', { name: baseName + '.md', content: fallback });
    } catch {
      alert(`Failed to import ${file.name}: ${err}`);
    }
  }
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

async function convertPdfToMarkdown(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');

  // Use bundled worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();

  const buffer = await readFileAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[][] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items
      .filter((item): item is typeof item & { str: string } => 'str' in item)
      .map((item) => {
        const t = item as {
          str: string;
          transform: number[];
          width?: number;
          height?: number;
        };
        return {
          str: t.str,
          transform: t.transform,
          width: t.width,
          height: t.height,
        };
      });
    pages.push(pdfTextItemsToLines(items));
  }

  const title = file.name.replace(/\.pdf$/i, '');
  return buildPdfMarkdown(title, pages);
}

async function convertDocxToMarkdown(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const buffer = await readFileAsArrayBuffer(file);

  const convertImage = mammoth.images.imgElement(async (image) => {
    const imageBuffer = await image.read('base64');
    return {
      src: `data:${image.contentType};base64,${imageBuffer}`,
    };
  });

  const result = await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    { convertImage },
  );

  if (result.messages?.length) {
    console.info('DOCX conversion messages:', result.messages);
  }

  return htmlToMarkdown(result.value || '');
}

async function convertRichTextFallback(file: File, ext: string): Promise<string> {
  // RTF is mostly ASCII; ODT is a zip — reject binary zip signatures
  const buffer = await readFileAsArrayBuffer(file);
  const head = new Uint8Array(buffer.slice(0, 4));
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // PK
  if (isZip || ext === 'odt') {
    throw new Error(
      `Cannot parse .${ext} in the browser. Export to .docx or .pdf and import again.`,
    );
  }

  const text = await readFileAsText(file);
  if (!text.trim()) {
    throw new Error(`Cannot read .${ext} file. Please convert to .docx or .pdf first.`);
  }

  // Strip simple RTF control words when present
  const cleaned =
    ext === 'rtf'
      ? text
          .replace(/\{\\rtf1[\s\S]*?(?=\\pard|\\plain|[A-Za-z])/i, '')
          .replace(/\\[a-z]+\d* ?/gi, '')
          .replace(/[{}]/g, '')
          .replace(/\r\n/g, '\n')
          .trim()
      : text;

  return `<!-- Imported from .${ext} file — some formatting may be lost -->\n\n${cleaned || text}`;
}

export async function importFromGitHubURL(url: string): Promise<void> {
  try {
    let rawUrl = url.trim();
    if (rawUrl.includes('github.com') && !rawUrl.includes('raw.githubusercontent.com')) {
      rawUrl = rawUrl
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/blob/', '/');
    }

    const resp = await fetch(rawUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const content = await resp.text();

    const name = rawUrl.split('/').pop() || 'imported.md';
    emit('file-imported', { name, content });
  } catch (err) {
    console.error('GitHub import failed:', err);
    alert(`Failed to import: ${err}`);
  }
}
