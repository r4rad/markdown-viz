import { getActiveTab } from './state';
import { emit } from './events';

export function setupImport(): void {
  // Drag and drop on document
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (files?.length) {
      handleFile(files[0]);
    }
  });

  emit('import-ready');
}

export function openFilePicker(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.markdown,.txt,.text,.mdx';
  input.addEventListener('change', () => {
    if (input.files?.length) {
      handleFile(input.files[0]);
    }
  });
  input.click();
}

function handleFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    const content = reader.result as string;
    const name = file.name || 'Imported.md';
    emit('file-imported', { name, content });
  };
  reader.readAsText(file);
}

export async function importFromGitHubURL(url: string): Promise<void> {
  try {
    // Convert github.com URLs to raw URLs
    let rawUrl = url.trim();
    if (rawUrl.includes('github.com') && !rawUrl.includes('raw.githubusercontent.com')) {
      rawUrl = rawUrl
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/blob/', '/');
    }

    const resp = await fetch(rawUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const content = await resp.text();

    const name = rawUrl.split('/').pop() || 'imported.md';
    emit('file-imported', { name, content });
  } catch (err) {
    console.error('GitHub import failed:', err);
    alert(`Failed to import: ${err}`);
  }
}
