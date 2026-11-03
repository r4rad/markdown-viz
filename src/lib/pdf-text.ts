/** Assemble readable markdown-ish text from pdf.js text items. */

export type PdfTextItem = {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
};

/**
 * Convert pdf.js page text items into lines with paragraph breaks and
 * inter-word spacing (pdf.js often omits spaces between adjacent glyphs).
 */
export function pdfTextItemsToLines(items: PdfTextItem[]): string[] {
  const lines: string[] = [];
  let lastY: number | null = null;
  let lastEndX: number | null = null;
  let currentLine = '';
  let lastHeight = 12;

  for (const item of items) {
    if (!item.str) continue;
    const x = item.transform[4] ?? 0;
    const y = Math.round(item.transform[5] ?? 0);
    const height = item.height || lastHeight || 12;
    lastHeight = height;

    if (lastY !== null && Math.abs(y - lastY) > 2) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = '';
      lastEndX = null;

      // Larger vertical gap → paragraph break
      if (Math.abs(y - lastY) > height * 1.5) {
        lines.push('');
      }
    }

    // Insert a space when glyphs are horizontally separated
    if (
      lastEndX !== null &&
      currentLine.length > 0 &&
      !currentLine.endsWith(' ') &&
      !item.str.startsWith(' ') &&
      x - lastEndX > Math.max(1.5, height * 0.12)
    ) {
      currentLine += ' ';
    }

    currentLine += item.str;
    const advance = item.width ?? estimateWidth(item.str, height);
    lastEndX = x + advance;
    lastY = y;
  }

  if (currentLine.trim()) lines.push(currentLine.trim());
  return lines;
}

function estimateWidth(str: string, height: number): number {
  // Rough monospace-ish estimate when pdf.js width is missing
  return str.length * height * 0.5;
}

export function buildPdfMarkdown(
  fileTitle: string,
  pages: string[][],
): string {
  const lines: string[] = [`# ${fileTitle}`, ''];

  pages.forEach((pageLines, index) => {
    if (pages.length > 1) {
      if (index > 0) lines.push('', '---', '');
      lines.push(`## Page ${index + 1}`, '');
    }
    lines.push(...pageLines);
  });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
