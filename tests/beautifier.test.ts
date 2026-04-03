import { describe, it, expect } from 'vitest';

// Test the basicFormat function logic directly
// (beautifyMarkdown depends on prettier dynamic import which is harder to test)
function basicFormat(md: string): string {
  let result = md;
  result = result.replace(/\r\n/g, '\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2');
  result = result.replace(/[ \t]+$/gm, '');
  result = result.trimEnd() + '\n';
  return result;
}

describe('Beautifier - basicFormat', () => {
  it('should normalize line endings', () => {
    const result = basicFormat('line1\r\nline2\r\nline3');
    expect(result).not.toContain('\r');
    expect(result).toContain('line1\nline2\nline3');
  });

  it('should collapse multiple blank lines to double newline', () => {
    const result = basicFormat('para1\n\n\n\n\npara2');
    expect(result).toBe('para1\n\npara2\n');
  });

  it('should ensure blank line before headings', () => {
    const result = basicFormat('some text\n# Heading');
    expect(result).toContain('some text\n\n# Heading');
  });

  it('should handle heading levels 1-6', () => {
    for (let i = 1; i <= 6; i++) {
      const hashes = '#'.repeat(i);
      const result = basicFormat(`text\n${hashes} Heading`);
      expect(result).toContain(`text\n\n${hashes} Heading`);
    }
  });

  it('should trim trailing whitespace', () => {
    const result = basicFormat('line with spaces   \nanother line\t');
    expect(result).toBe('line with spaces\nanother line\n');
  });

  it('should ensure file ends with single newline', () => {
    const result = basicFormat('content');
    expect(result).toBe('content\n');
  });

  it('should handle already-formatted content', () => {
    const input = '# Title\n\nParagraph\n\n## Section\n\nContent\n';
    const result = basicFormat(input);
    expect(result).toBe(input);
  });

  it('should handle empty string', () => {
    const result = basicFormat('');
    expect(result).toBe('\n');
  });

  it('should handle content with only whitespace', () => {
    const result = basicFormat('   \n  \n   ');
    expect(result).toBe('\n');
  });

  it('should preserve code block content', () => {
    const input = '```\ncode here\n   indented\n```\n';
    const result = basicFormat(input);
    expect(result).toContain('   indented');
  });

  it('should handle mixed line endings', () => {
    const result = basicFormat('line1\rline2\r\nline3\n');
    expect(result).not.toContain('\r\n');
  });

  it('should not add extra blank line if heading already has one', () => {
    const input = 'text\n\n# Heading\n';
    const result = basicFormat(input);
    // Should not add additional blank line
    expect(result).toBe('text\n\n# Heading\n');
  });
});
