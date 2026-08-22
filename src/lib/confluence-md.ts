const UNKNOWN_OPEN = '<!-- wiki-unknown:';
const UNKNOWN_CLOSE = '-->';

export function confluenceStorageToMarkdown(storage: string): { markdown: string; warning?: string } {
  let warning: string | undefined;
  let html = storage;
  if (/ac:structured-macro|ac:adf/.test(storage)) {
    warning = 'Unsupported Confluence macros were preserved as wiki-unknown comments.';
    html = html.replace(/<ac:structured-macro[\s\S]*?<\/ac:structured-macro>/gi, (m) =>
      `\n${UNKNOWN_OPEN} confluence-macro ${UNKNOWN_CLOSE}\n\`\`\`wiki-unknown\n${m}\n\`\`\`\n`,
    );
  }
  const markdown = html
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
  return { markdown: markdown || html, warning };
}

export function markdownToConfluenceStorage(markdown: string): string {
  const unknownBlocks: string[] = [];
  const withoutUnknown = markdown.replace(/```wiki-unknown\n([\s\S]*?)```/g, (_, body) => {
    unknownBlocks.push(body);
    return `<!--UNKNOWN_${unknownBlocks.length - 1}-->`;
  });
  const html = withoutUnknown
    .split('\n')
    .map((line) => {
      if (line.startsWith('### ')) return `<h3>${escapeXml(line.slice(4))}</h3>`;
      if (line.startsWith('## ')) return `<h2>${escapeXml(line.slice(3))}</h2>`;
      if (line.startsWith('# ')) return `<h1>${escapeXml(line.slice(2))}</h1>`;
      if (line.startsWith('- ')) return `<li>${escapeXml(line.slice(2))}</li>`;
      if (!line.trim()) return '';
      return `<p>${escapeXml(line)}</p>`;
    })
    .filter(Boolean)
    .join('');
  return html.replace(/<!--UNKNOWN_(\d+)-->/g, (_, i) => unknownBlocks[Number(i)] || '');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
