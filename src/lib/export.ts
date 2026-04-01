import { getActiveTab } from './state';
import { getPreviewElement } from '../components/Preview';

export async function exportMarkdown(): Promise<void> {
  const tab = getActiveTab();
  if (!tab) return;
  downloadFile(tab.content, tab.name.endsWith('.md') ? tab.name : `${tab.name}.md`, 'text/markdown');
}

export async function exportHTML(): Promise<void> {
  const tab = getActiveTab();
  if (!tab) return;
  const preview = getPreviewElement();
  if (!preview) return;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(tab.name)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1f2937; }
    pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
    code { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 85%; }
    table { border-collapse: collapse; } th, td { border: 1px solid #d1d5db; padding: 6px 13px; }
    blockquote { border-left: 4px solid #d1d5db; margin: 0; padding: 0 1em; color: #6b7280; }
    img { max-width: 100%; }
    h1, h2 { border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
  </style>
</head>
<body>${preview.innerHTML}</body>
</html>`;

  const name = tab.name.replace(/\.[^.]+$/, '') + '.html';
  downloadFile(html, name, 'text/html');
}

export async function exportPDF(): Promise<void> {
  const preview = getPreviewElement();
  const tab = getActiveTab();
  if (!preview || !tab) return;

  try {
    const { default: html2canvas } = await import('html2canvas');
    const { jsPDF } = await import('jspdf');

    const canvas = await html2canvas(preview, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const imgW = canvas.width;
    const imgH = canvas.height;
    const ratio = pdfW / imgW;
    const totalH = imgH * ratio;

    let position = 0;
    while (position < totalH) {
      if (position > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, -position, pdfW, totalH);
      position += pdfH;
    }

    const name = tab.name.replace(/\.[^.]+$/, '') + '.pdf';
    pdf.save(name);
  } catch (err) {
    console.error('PDF export failed:', err);
    alert(`PDF export failed: ${err}`);
  }
}

function downloadFile(content: string, name: string, type: string): void {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
