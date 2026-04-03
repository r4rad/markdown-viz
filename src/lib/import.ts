import { getActiveTab } from './state';
import { emit } from './events';

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

async function handleFile(file: File): Promise<void> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const baseName = file.name.replace(/\.[^.]+$/, '');

  try {
    let content: string;

    if (ext === 'pdf') {
      content = await convertPdfToMarkdown(file);
    } else if (ext === 'docx') {
      content = await convertDocxToMarkdown(file);
    } else if (ext === 'doc' || ext === 'odt' || ext === 'rtf') {
      content = await convertRichTextFallback(file, ext);
    } else {
      // Plain text / markdown files
      content = await readFileAsText(file);
    }

    const name = baseName + '.md';
    emit('file-imported', { name, content });
  } catch (err) {
    console.error(`Import failed for ${file.name}:`, err);
    // Fallback: try reading as plain text
    try {
      const content = await readFileAsText(file);
      emit('file-imported', { name: baseName + '.md', content });
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
  const lines: string[] = [];

  lines.push(`# ${file.name.replace(/\.pdf$/i, '')}\n`);

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    if (pdf.numPages > 1) {
      lines.push(`\n---\n\n## Page ${i}\n`);
    }

    let lastY: number | null = null;
    let currentLine = '';

    for (const item of textContent.items) {
      if (!('str' in item)) continue;
      const textItem = item as { str: string; transform: number[]; height: number };
      const y = Math.round(textItem.transform[5]);

      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = '';

        // Detect paragraph breaks (larger gaps)
        if (lastY !== null && Math.abs(y - lastY) > textItem.height * 1.5) {
          lines.push('');
        }
      }

      currentLine += textItem.str;
      lastY = y;
    }

    if (currentLine.trim()) lines.push(currentLine.trim());
  }

  return lines.join('\n');
}

async function convertDocxToMarkdown(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const buffer = await readFileAsArrayBuffer(file);
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });

  if (result.messages?.length) {
    console.info('DOCX conversion messages:', result.messages);
  }

  return htmlToMarkdown(result.value || '');
}

function htmlToMarkdown(html: string): string {
  const lines: string[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const children = () => Array.from(el.childNodes).map(walk).join('');

    switch (tag) {
      case 'h1': return `# ${children()}\n\n`;
      case 'h2': return `## ${children()}\n\n`;
      case 'h3': return `### ${children()}\n\n`;
      case 'h4': return `#### ${children()}\n\n`;
      case 'h5': return `##### ${children()}\n\n`;
      case 'h6': return `###### ${children()}\n\n`;
      case 'p': return `${children()}\n\n`;
      case 'br': return '\n';
      case 'strong':
      case 'b': return `**${children()}**`;
      case 'em':
      case 'i': return `*${children()}*`;
      case 'u': return `<u>${children()}</u>`;
      case 's':
      case 'del':
      case 'strike': return `~~${children()}~~`;
      case 'code': return `\`${children()}\``;
      case 'pre': return `\n\`\`\`\n${el.textContent || ''}\n\`\`\`\n\n`;
      case 'blockquote': return children().split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
      case 'a': {
        const href = el.getAttribute('href') || '';
        return `[${children()}](${href})`;
      }
      case 'img': {
        const src = el.getAttribute('src') || '';
        const alt = el.getAttribute('alt') || '';
        return `![${alt}](${src})`;
      }
      case 'ul': {
        return Array.from(el.children).map(li => `- ${walk(li).trim()}`).join('\n') + '\n\n';
      }
      case 'ol': {
        return Array.from(el.children).map((li, i) => `${i + 1}. ${walk(li).trim()}`).join('\n') + '\n\n';
      }
      case 'li': return children();
      case 'table': {
        const rows = Array.from(el.querySelectorAll('tr'));
        if (!rows.length) return '';
        const tableLines: string[] = [];
        rows.forEach((row, ri) => {
          const cells = Array.from(row.querySelectorAll('th, td'))
            .map(c => (c.textContent || '').trim().replace(/\|/g, '\\|'));
          tableLines.push(`| ${cells.join(' | ')} |`);
          if (ri === 0) {
            tableLines.push(`| ${cells.map(() => '---').join(' | ')} |`);
          }
        });
        return tableLines.join('\n') + '\n\n';
      }
      case 'hr': return '\n---\n\n';
      case 'sup': return `<sup>${children()}</sup>`;
      case 'sub': return `<sub>${children()}</sub>`;
      default: return children();
    }
  }

  for (const child of Array.from(doc.body.childNodes)) {
    lines.push(walk(child));
  }

  return lines.join('').replace(/\n{3,}/g, '\n\n').trim();
}

async function convertRichTextFallback(file: File, ext: string): Promise<string> {
  // For formats without dedicated parsers, try reading as text
  const text = await readFileAsText(file);

  if (!text.trim()) {
    throw new Error(`Cannot read .${ext} file. Please convert to .docx or .pdf first.`);
  }

  // Wrap plain text with a note about the source format
  return `<!-- Imported from .${ext} file - some formatting may be lost -->\n\n${text}`;
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
