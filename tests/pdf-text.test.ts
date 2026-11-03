import { describe, it, expect } from 'vitest';
import { buildPdfMarkdown, pdfTextItemsToLines } from '../src/lib/pdf-text';

describe('pdf-text', () => {
  it('inserts spaces between horizontally separated glyphs', () => {
    const lines = pdfTextItemsToLines([
      { str: 'Hello', transform: [1, 0, 0, 1, 0, 100], width: 30, height: 12 },
      { str: 'world', transform: [1, 0, 0, 1, 36, 100], width: 30, height: 12 },
    ]);
    expect(lines).toEqual(['Hello world']);
  });

  it('starts a new line on vertical movement', () => {
    const lines = pdfTextItemsToLines([
      { str: 'Line one', transform: [1, 0, 0, 1, 0, 200], width: 40, height: 12 },
      // 10px gap: new line, but below paragraph threshold (1.5 * height)
      { str: 'Line two', transform: [1, 0, 0, 1, 0, 190], width: 40, height: 12 },
    ]);
    expect(lines).toEqual(['Line one', 'Line two']);
  });

  it('inserts a blank line for larger paragraph gaps', () => {
    const lines = pdfTextItemsToLines([
      { str: 'Para A', transform: [1, 0, 0, 1, 0, 200], width: 40, height: 12 },
      { str: 'Para B', transform: [1, 0, 0, 1, 0, 160], width: 40, height: 12 },
    ]);
    expect(lines).toEqual(['Para A', '', 'Para B']);
  });

  it('buildPdfMarkdown labels multipage documents', () => {
    const md = buildPdfMarkdown('Report', [
      ['First page body'],
      ['Second page body'],
    ]);
    expect(md).toContain('# Report');
    expect(md).toContain('## Page 1');
    expect(md).toContain('## Page 2');
    expect(md).toContain('First page body');
    expect(md).toContain('Second page body');
    expect(md).toContain('---');
  });
});
