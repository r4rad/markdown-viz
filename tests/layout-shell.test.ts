import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression: `.app-container` was replaced by `.workspace-body` and the editor
 * stopped scrolling because panes grew with content under `overflow: hidden`.
 */
describe('layout shell CSS', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles/layout.css'), 'utf8');

  it('keeps .app-container as a column flex shell', () => {
    expect(css).toMatch(/\.app-container\s*\{[^}]*display:\s*flex/s);
    expect(css).toMatch(/\.app-container\s*\{[^}]*flex-direction:\s*column/s);
    expect(css).toMatch(/\.app-container\s*\{[^}]*overflow:\s*hidden/s);
  });

  it('bounds editor pane height for CodeMirror scrolling', () => {
    expect(css).toMatch(/\.editor-pane,\s*\.preview-pane\s*\{[^}]*min-height:\s*0/s);
    expect(css).toMatch(/\.editor-pane\s*>\s*\.cm-editor\s*\{[^}]*height:\s*100%/s);
  });
});
