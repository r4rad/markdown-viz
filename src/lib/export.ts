import { getActiveTab } from './state';
import { getPreviewElement } from '../components/Preview';
import {
  addCanvasSlicesToPdf,
  buildDocxHtml,
  buildStandaloneHtml,
  prepareExportRoot,
  replaceSvgsWithPngImages,
  sliceCanvasVertically,
  waitForPreviewDiagrams,
} from './export-dom';

export async function exportMarkdown(): Promise<void> {
  const tab = getActiveTab();
  if (!tab) return;
  downloadFile(tab.content, tab.name.endsWith('.md') ? tab.name : `${tab.name}.md`, 'text/markdown');
}

export async function exportHTML(): Promise<void> {
  const tab = getActiveTab();
  const preview = getPreviewElement();
  if (!tab || !preview) return;

  await waitForPreviewDiagrams(preview);
  const prepared = prepareExportRoot(preview);
  try {
    await replaceSvgsWithPngImages(prepared.content);
    const html = buildStandaloneHtml(tab.name, prepared.content.innerHTML);
    const name = tab.name.replace(/\.[^.]+$/, '') + '.html';
    downloadFile(html, name, 'text/html');
  } finally {
    prepared.dispose();
  }
}

export async function exportPDF(): Promise<void> {
  const preview = getPreviewElement();
  const tab = getActiveTab();
  if (!preview || !tab) return;

  let prepared: ReturnType<typeof prepareExportRoot> | null = null;
  try {
    await waitForPreviewDiagrams(preview);
    prepared = prepareExportRoot(preview);
    await replaceSvgsWithPngImages(prepared.content);

    const { default: html2canvas } = await import('html2canvas');
    const { jsPDF } = await import('jspdf');

    // Capture the full off-screen document (not the scrolled viewport).
    const fullCanvas = await html2canvas(prepared.content, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: prepared.content.scrollWidth,
      windowHeight: prepared.content.scrollHeight,
      height: prepared.content.scrollHeight,
      width: prepared.content.scrollWidth,
    });

    const slices = sliceCanvasVertically(fullCanvas);
    const pdf = new jsPDF('p', 'mm', 'a4');
    addCanvasSlicesToPdf(pdf, slices);

    const name = tab.name.replace(/\.[^.]+$/, '') + '.pdf';
    pdf.save(name);
  } catch (err) {
    console.error('PDF export failed:', err);
    alert(`PDF export failed: ${err}`);
  } finally {
    prepared?.dispose();
  }
}

export async function exportDOCX(): Promise<void> {
  const preview = getPreviewElement();
  const tab = getActiveTab();
  if (!preview || !tab) return;

  let prepared: ReturnType<typeof prepareExportRoot> | null = null;
  try {
    await waitForPreviewDiagrams(preview);
    prepared = prepareExportRoot(preview);
    // Word / html-docx do not reliably embed SVG — rasterize diagrams first.
    await replaceSvgsWithPngImages(prepared.content);

    const { asBlob } = await import('html-docx-js-typescript');
    const htmlContent = buildDocxHtml(prepared.content.innerHTML);
    const blob = await asBlob(htmlContent) as Blob;
    const name = tab.name.replace(/\.[^.]+$/, '') + '.docx';
    downloadBlob(blob, name);
  } catch (err) {
    console.error('DOCX export failed:', err);
    alert(`DOCX export failed: ${err}`);
  } finally {
    prepared?.dispose();
  }
}

function downloadFile(content: string, name: string, type: string): void {
  const blob = new Blob([content], { type });
  downloadBlob(blob, name);
}

function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
