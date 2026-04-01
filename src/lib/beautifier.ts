import { getActiveTab } from './state';
import { emit } from './events';

export async function beautifyMarkdown(): Promise<void> {
  const tab = getActiveTab();
  if (!tab) return;

  try {
    const [prettier, markdownPlugin] = await Promise.all([
      import('prettier/standalone'),
      import('prettier/plugins/markdown'),
    ]);

    const formatted = await prettier.default.format(tab.content, {
      parser: 'markdown',
      plugins: [markdownPlugin.default],
      proseWrap: 'preserve',
      tabWidth: 2,
      printWidth: 80,
    });

    emit('set-editor-content', formatted);
  } catch (err) {
    console.error('Beautify failed, using basic formatter:', err);
    // Fallback: basic formatting
    const formatted = basicFormat(tab.content);
    emit('set-editor-content', formatted);
  }
}

function basicFormat(md: string): string {
  let result = md;

  // Normalize line endings
  result = result.replace(/\r\n/g, '\n');

  // Ensure single blank line before headings
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2');

  // Trim trailing whitespace from lines
  result = result.replace(/[ \t]+$/gm, '');

  // Ensure file ends with single newline
  result = result.trimEnd() + '\n';

  return result;
}
