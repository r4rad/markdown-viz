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

  // Diagram container round-trip tests
  it('should reconstruct mermaid code blocks from diagram containers', () => {
    const source = 'graph TD\n    A-->B';
    const html = `<div class="diagram-container" data-diagram="mermaid" data-source="${encodeURIComponent(source)}"><pre class="mermaid-rendered"><svg>...</svg></pre></div>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain('```mermaid');
    expect(md).toContain('graph TD');
    expect(md).toContain('A-->B');
    expect(md).toContain('```');
  });

  it('should reconstruct graphviz code blocks from diagram containers', () => {
    const source = 'digraph { A -> B }';
    const html = `<div class="diagram-container" data-diagram="graphviz" data-source="${encodeURIComponent(source)}"><pre class="graphviz-rendered"><svg>...</svg></pre></div>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain('```dot');
    expect(md).toContain('digraph { A -> B }');
  });

  it('should reconstruct nomnoml code blocks from diagram containers', () => {
    const source = '[Foo]->[Bar]';
    const html = `<div class="diagram-container" data-diagram="nomnoml" data-source="${encodeURIComponent(source)}"><pre><svg>...</svg></pre></div>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain('```nomnoml');
    expect(md).toContain('[Foo]->[Bar]');
  });

  it('should preserve code blocks with language class', () => {
    const html = '<pre><code class="language-javascript">const x = 1;</code></pre>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('```javascript');
    expect(md).toContain('const x = 1;');
  });

  it('should preserve code blocks without language', () => {
    const html = '<pre><code>plain code</code></pre>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('```');
    expect(md).toContain('plain code');
  });

  it('should preserve images with all attributes', () => {
    const html = '<img src="https://example.com/img.png" alt="My Image">';
    const md = htmlToMarkdown(html);
    expect(md).toBe('![My Image](https://example.com/img.png)');
  });

  it('should preserve links with nested formatting', () => {
    const html = '<a href="https://example.com"><strong>Bold Link</strong></a>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('[**Bold Link**](https://example.com)');
  });
});
