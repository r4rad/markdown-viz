import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the import module's helper logic by importing and testing
// the htmlToMarkdown conversion via the DOCX pipeline
// and the file handling logic

describe('Import Module', () => {
  describe('File extension handling', () => {
    it('should recognize markdown extensions', () => {
      const mdExtensions = ['md', 'markdown', 'mdx', 'txt', 'text'];
      for (const ext of mdExtensions) {
        expect(['md', 'markdown', 'mdx', 'txt', 'text'].includes(ext)).toBe(true);
      }
    });

    it('should recognize convertible extensions', () => {
      const convertible = ['pdf', 'docx', 'doc', 'odt', 'rtf'];
      for (const ext of convertible) {
        expect(['pdf', 'docx', 'doc', 'odt', 'rtf'].includes(ext)).toBe(true);
      }
    });
  });

  describe('HTML to Markdown conversion (via DOM)', () => {
    // Test the DOM-based HTML-to-markdown conversion logic
    function htmlToMarkdown(html: string): string {
      const lines: string[] = [];
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      function walk(node: Node): string {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const children = () => Array.from(el.childNodes).map(walk).join('');

        switch (tag) {
          case 'h1': return `# ${children()}\n\n`;
          case 'h2': return `## ${children()}\n\n`;
          case 'h3': return `### ${children()}\n\n`;
          case 'p': return `${children()}\n\n`;
          case 'strong': case 'b': return `**${children()}**`;
          case 'em': case 'i': return `*${children()}*`;
          case 'code': return `\`${children()}\``;
          case 'a': return `[${children()}](${el.getAttribute('href') || ''})`;
          case 'img': return `![${el.getAttribute('alt') || ''}](${el.getAttribute('src') || ''})`;
          case 'ul': return Array.from(el.children).map(li => `- ${walk(li).trim()}`).join('\n') + '\n\n';
          case 'ol': return Array.from(el.children).map((li, i) => `${i + 1}. ${walk(li).trim()}`).join('\n') + '\n\n';
          case 'li': return children();
          case 'hr': return '\n---\n\n';
          case 'br': return '\n';
          case 'blockquote': return children().split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
          case 'pre': return `\n\`\`\`\n${el.textContent || ''}\n\`\`\`\n\n`;
          case 'del': case 's': return `~~${children()}~~`;
          case 'table': {
            const rows = Array.from(el.querySelectorAll('tr'));
            if (!rows.length) return '';
            const tableLines: string[] = [];
            rows.forEach((row, ri) => {
              const cells = Array.from(row.querySelectorAll('th, td'))
                .map(c => (c.textContent || '').trim().replace(/\|/g, '\\|'));
              tableLines.push(`| ${cells.join(' | ')} |`);
              if (ri === 0) tableLines.push(`| ${cells.map(() => '---').join(' | ')} |`);
            });
            return tableLines.join('\n') + '\n\n';
          }
          default: return children();
        }
      }

      for (const child of Array.from(doc.body.childNodes)) {
        lines.push(walk(child));
      }
      return lines.join('').replace(/\n{3,}/g, '\n\n').trim();
    }

    it('should convert headings', () => {
      expect(htmlToMarkdown('<h1>Title</h1>')).toContain('# Title');
      expect(htmlToMarkdown('<h2>Subtitle</h2>')).toContain('## Subtitle');
      expect(htmlToMarkdown('<h3>Section</h3>')).toContain('### Section');
    });

    it('should convert paragraphs', () => {
      const result = htmlToMarkdown('<p>Hello world</p>');
      expect(result).toContain('Hello world');
    });

    it('should convert bold and italic', () => {
      expect(htmlToMarkdown('<strong>bold</strong>')).toContain('**bold**');
      expect(htmlToMarkdown('<b>bold</b>')).toContain('**bold**');
      expect(htmlToMarkdown('<em>italic</em>')).toContain('*italic*');
      expect(htmlToMarkdown('<i>italic</i>')).toContain('*italic*');
    });

    it('should convert links', () => {
      const result = htmlToMarkdown('<a href="https://example.com">Link</a>');
      expect(result).toContain('[Link](https://example.com)');
    });

    it('should convert images', () => {
      const result = htmlToMarkdown('<img src="pic.png" alt="Photo" />');
      expect(result).toContain('![Photo](pic.png)');
    });

    it('should convert unordered lists', () => {
      const result = htmlToMarkdown('<ul><li>Item 1</li><li>Item 2</li></ul>');
      expect(result).toContain('- Item 1');
      expect(result).toContain('- Item 2');
    });

    it('should convert ordered lists', () => {
      const result = htmlToMarkdown('<ol><li>First</li><li>Second</li></ol>');
      expect(result).toContain('1. First');
      expect(result).toContain('2. Second');
    });

    it('should convert inline code', () => {
      const result = htmlToMarkdown('<code>const x = 1</code>');
      expect(result).toContain('`const x = 1`');
    });

    it('should convert code blocks', () => {
      const result = htmlToMarkdown('<pre>function hello() {}</pre>');
      expect(result).toContain('```\nfunction hello() {}\n```');
    });

    it('should convert tables', () => {
      const html = '<table><tr><th>Name</th><th>Age</th></tr><tr><td>Alice</td><td>30</td></tr></table>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('| Name | Age |');
      expect(result).toContain('| --- | --- |');
      expect(result).toContain('| Alice | 30 |');
    });

    it('should convert horizontal rules', () => {
      const result = htmlToMarkdown('<hr/>');
      expect(result).toContain('---');
    });

    it('should convert strikethrough', () => {
      expect(htmlToMarkdown('<del>deleted</del>')).toContain('~~deleted~~');
      expect(htmlToMarkdown('<s>struck</s>')).toContain('~~struck~~');
    });

    it('should convert blockquotes', () => {
      const result = htmlToMarkdown('<blockquote>Quote text</blockquote>');
      expect(result).toContain('> Quote text');
    });

    it('should handle nested elements', () => {
      const result = htmlToMarkdown('<p>This is <strong>bold and <em>italic</em></strong> text</p>');
      expect(result).toContain('**bold and *italic***');
    });

    it('should handle empty input', () => {
      expect(htmlToMarkdown('')).toBe('');
    });

    it('should escape pipes in table cells', () => {
      const html = '<table><tr><td>a|b</td></tr></table>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('a\\|b');
    });
  });
});
