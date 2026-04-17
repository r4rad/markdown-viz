import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from '../src/lib/html-to-markdown';

describe('htmlToMarkdown', () => {
  it('should convert headings', () => {
    expect(htmlToMarkdown('<h1>Title</h1>')).toContain('# Title');
    expect(htmlToMarkdown('<h2>Sub</h2>')).toContain('## Sub');
    expect(htmlToMarkdown('<h3>Sub3</h3>')).toContain('### Sub3');
  });

  it('should convert paragraphs', () => {
    expect(htmlToMarkdown('<p>Hello world</p>')).toContain('Hello world');
  });

  it('should convert bold and italic', () => {
    expect(htmlToMarkdown('<strong>bold</strong>')).toContain('**bold**');
    expect(htmlToMarkdown('<b>bold</b>')).toContain('**bold**');
    expect(htmlToMarkdown('<em>italic</em>')).toContain('*italic*');
    expect(htmlToMarkdown('<i>italic</i>')).toContain('*italic*');
  });

  it('should convert links', () => {
    const md = htmlToMarkdown('<a href="https://example.com">click</a>');
    expect(md).toContain('[click](https://example.com)');
  });

  it('should convert images', () => {
    const md = htmlToMarkdown('<img src="img.png" alt="photo">');
    expect(md).toContain('![photo](img.png)');
  });

  it('should convert unordered lists', () => {
    const md = htmlToMarkdown('<ul><li>one</li><li>two</li></ul>');
    expect(md).toContain('- one');
    expect(md).toContain('- two');
  });

  it('should convert ordered lists', () => {
    const md = htmlToMarkdown('<ol><li>first</li><li>second</li></ol>');
    expect(md).toContain('1. first');
    expect(md).toContain('2. second');
  });

  it('should convert code blocks', () => {
    const md = htmlToMarkdown('<pre>code here</pre>');
    expect(md).toContain('```');
    expect(md).toContain('code here');
  });

  it('should convert inline code', () => {
    expect(htmlToMarkdown('<code>inline</code>')).toContain('`inline`');
  });

  it('should convert blockquotes', () => {
    const md = htmlToMarkdown('<blockquote>quoted text</blockquote>');
    expect(md).toContain('> ');
  });

  it('should convert tables', () => {
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('| A | B |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| 1 | 2 |');
  });

  it('should convert horizontal rules', () => {
    expect(htmlToMarkdown('<hr>')).toContain('---');
  });

  it('should convert strikethrough', () => {
    expect(htmlToMarkdown('<del>deleted</del>')).toContain('~~deleted~~');
    expect(htmlToMarkdown('<s>struck</s>')).toContain('~~struck~~');
  });

  it('should handle nested elements', () => {
    const md = htmlToMarkdown('<p>This is <strong>bold and <em>italic</em></strong> text</p>');
    expect(md).toContain('**bold and *italic***');
  });

  it('should handle empty input', () => {
    expect(htmlToMarkdown('')).toBe('');
  });

  it('should handle plain text', () => {
    expect(htmlToMarkdown('just text')).toBe('just text');
  });

  it('should collapse excessive newlines', () => {
    const md = htmlToMarkdown('<p>A</p><p>B</p><p>C</p>');
    expect(md).not.toMatch(/\n{4,}/);
  });
});
