export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return '';

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

    // Diagram containers: reconstruct code blocks from data-source
    if (el.classList?.contains('diagram-container') && el.dataset?.source && el.dataset?.diagram) {
      const source = decodeURIComponent(el.dataset.source);
      const lang = el.dataset.diagram === 'graphviz' ? 'dot' : el.dataset.diagram;
      return `\n\`\`\`${lang}\n${source}\n\`\`\`\n\n`;
    }

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
      case 'pre': {
        const codeEl = el.querySelector('code');
        if (codeEl) {
          const langMatch = codeEl.className.match(/language-(\S+)/);
          const lang = langMatch ? langMatch[1] : '';
          return `\n\`\`\`${lang}\n${codeEl.textContent || ''}\n\`\`\`\n\n`;
        }
        return `\n\`\`\`\n${el.textContent || ''}\n\`\`\`\n\n`;
      }
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
      case 'ul':
        return renderList(el, 'ul') + '\n\n';
      case 'ol':
        return renderList(el, 'ol') + '\n\n';
      case 'li':
        return renderListItemChildren(el);
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
      // Skip SVG elements entirely
      case 'svg': return '';
      case 'div': return children();
      default: return children();
    }
  }

  for (const child of Array.from(doc.body.childNodes)) {
    lines.push(walk(child));
  }

  return lines.join('').replace(/\n{3,}/g, '\n\n').trim();

  function renderList(listEl: HTMLElement, type: 'ul' | 'ol', depth = 0): string {
    const indent = '  '.repeat(depth);
    return Array.from(listEl.children)
      .filter((c) => (c as HTMLElement).tagName?.toLowerCase() === 'li')
      .map((li, i) => {
        const marker = type === 'ol' ? `${i + 1}.` : '-';
        const body = renderListItemChildren(li as HTMLElement, depth);
        const [first, ...rest] = body.split('\n');
        const head = `${indent}${marker} ${first.trim()}`;
        const tail = rest
          .map((line) => (line.length ? `${indent}  ${line}` : ''))
          .join('\n');
        return tail ? `${head}\n${tail}` : head;
      })
      .join('\n');
  }

  function renderListItemChildren(li: HTMLElement, depth = 0): string {
    const parts: string[] = [];
    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as HTMLElement;
        const tag = childEl.tagName.toLowerCase();
        if (tag === 'ul' || tag === 'ol') {
          parts.push('\n' + renderList(childEl, tag, depth + 1));
          continue;
        }
        if (tag === 'p') {
          parts.push(Array.from(childEl.childNodes).map(walk).join('').trim());
          continue;
        }
      }
      parts.push(walk(child));
    }
    return parts.join('').trim();
  }
}
