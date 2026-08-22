export interface NotionBlock {
  type: string;
  [key: string]: unknown;
}

export function notionBlocksToMarkdown(blocks: NotionBlock[]): { markdown: string; warning?: string } {
  const lines: string[] = [];
  let warning: string | undefined;
  for (const block of blocks) {
    const text = richText(block);
    switch (block.type) {
      case 'heading_1':
        lines.push(`# ${text}`);
        break;
      case 'heading_2':
        lines.push(`## ${text}`);
        break;
      case 'heading_3':
        lines.push(`### ${text}`);
        break;
      case 'bulleted_list_item':
        lines.push(`- ${text}`);
        break;
      case 'numbered_list_item':
        lines.push(`1. ${text}`);
        break;
      case 'code':
        lines.push('```', text, '```');
        break;
      case 'paragraph':
        lines.push(text, '');
        break;
      default:
        warning = 'Unsupported Notion blocks were preserved as wiki-unknown fences.';
        lines.push('```wiki-unknown', JSON.stringify(block), '```');
    }
  }
  return { markdown: lines.join('\n').trim(), warning };
}

export function markdownToNotionBlocks(markdown: string): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  const lines = markdown.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```wiki-unknown')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i] !== '```') {
        body.push(lines[i]);
        i++;
      }
      try {
        blocks.push(JSON.parse(body.join('\n')) as NotionBlock);
      } catch {
        blocks.push({ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: body.join('\n') } }] } });
      }
      i++;
      continue;
    }
    if (line.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i] !== '```') {
        body.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', code: { rich_text: [{ type: 'text', text: { content: body.join('\n') } }], language: 'plain text' } });
      i++;
      continue;
    }
    if (line.startsWith('# ')) blocks.push(heading(1, line.slice(2)));
    else if (line.startsWith('## ')) blocks.push(heading(2, line.slice(3)));
    else if (line.startsWith('### ')) blocks.push(heading(3, line.slice(4)));
    else if (line.startsWith('- ')) blocks.push({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt(line.slice(2)) } });
    else if (/^\d+\. /.test(line)) blocks.push({ type: 'numbered_list_item', numbered_list_item: { rich_text: rt(line.replace(/^\d+\. /, '')) } });
    else if (line.trim()) blocks.push({ type: 'paragraph', paragraph: { rich_text: rt(line) } });
    i++;
  }
  return blocks;
}

function heading(level: 1 | 2 | 3, content: string): NotionBlock {
  const key = `heading_${level}`;
  return { type: key, [key]: { rich_text: rt(content) } };
}

function rt(content: string) {
  return [{ type: 'text', text: { content } }];
}

function richText(block: NotionBlock): string {
  const inner = block[block.type] as { rich_text?: Array<{ plain_text?: string; text?: { content?: string } }> } | undefined;
  const parts = inner?.rich_text ?? [];
  return parts.map(p => p.plain_text || p.text?.content || '').join('');
}
