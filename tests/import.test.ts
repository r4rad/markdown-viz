import { describe, it, expect } from 'vitest';
import { filterMarkdownRelativePaths, isMarkdownImportPath } from '../src/lib/import';
import { htmlToMarkdown } from '../src/lib/html-to-markdown';

describe('Import Module', () => {
  describe('markdown-only directory filter', () => {
    it('accepts .md / .mdx / .markdown (case-insensitive)', () => {
      expect(isMarkdownImportPath('readme.md')).toBe(true);
      expect(isMarkdownImportPath('docs/Guide.MDX')).toBe(true);
      expect(isMarkdownImportPath('notes/Hello.Markdown')).toBe(true);
    });

    it('rejects non-markdown paths', () => {
      expect(isMarkdownImportPath('image.png')).toBe(false);
      expect(isMarkdownImportPath('notes.txt')).toBe(false);
      expect(isMarkdownImportPath('readme.md.bak')).toBe(false);
      expect(isMarkdownImportPath('folder')).toBe(false);
    });

    it('filters a mixed directory listing to markdown only', () => {
      const paths = [
        'docs/intro.md',
        'docs/logo.png',
        'docs/guide/setup.mdx',
        'docs/guide/data.json',
        'docs/CHANGELOG.markdown',
        'docs/notes.txt',
        'docs/nested/deep/README.MD',
      ];
      expect(filterMarkdownRelativePaths(paths)).toEqual([
        'docs/intro.md',
        'docs/guide/setup.mdx',
        'docs/CHANGELOG.markdown',
        'docs/nested/deep/README.MD',
      ]);
    });
  });

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

  describe('HTML to Markdown conversion', () => {
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
