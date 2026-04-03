import { describe, it, expect } from 'vitest';
import { themes, getTheme, getSavedTheme } from '../src/themes/themes';

describe('Theme System', () => {
  describe('themes array', () => {
    it('should have at least 10 themes', () => {
      expect(themes.length).toBeGreaterThanOrEqual(10);
    });

    it('should have both light and dark themes', () => {
      const light = themes.filter(t => t.type === 'light');
      const dark = themes.filter(t => t.type === 'dark');
      expect(light.length).toBeGreaterThanOrEqual(5);
      expect(dark.length).toBeGreaterThanOrEqual(5);
    });

    it('should have unique IDs', () => {
      const ids = themes.map(t => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should have unique names', () => {
      const names = themes.map(t => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('every theme should have required CSS variables', () => {
      const requiredVars = [
        '--bg-primary', '--bg-editor', '--bg-preview', '--bg-toolbar',
        '--text-primary', '--text-secondary', '--accent', '--border-primary',
      ];
      for (const theme of themes) {
        for (const v of requiredVars) {
          expect(theme.colors[v], `${theme.id} missing ${v}`).toBeDefined();
        }
      }
    });

    it('every theme should have syntax color variables', () => {
      const syntaxVars = [
        '--syntax-keyword', '--syntax-string', '--syntax-comment',
        '--syntax-function', '--syntax-variable', '--syntax-number',
        '--syntax-heading', '--syntax-bold', '--syntax-italic', '--syntax-url',
      ];
      for (const theme of themes) {
        for (const v of syntaxVars) {
          expect(theme.colors[v], `${theme.id} missing ${v}`).toBeDefined();
        }
      }
    });

    it('should include VS Code light and dark themes', () => {
      expect(themes.find(t => t.id === 'vscode-light')).toBeDefined();
      expect(themes.find(t => t.id === 'vscode-dark')).toBeDefined();
    });

    it('should include JetBrains light and dark themes', () => {
      expect(themes.find(t => t.id === 'jetbrains-light')).toBeDefined();
      expect(themes.find(t => t.id === 'jetbrains-dark')).toBeDefined();
    });

    it('should include GitHub light and dark themes', () => {
      expect(themes.find(t => t.id === 'github-light')).toBeDefined();
      expect(themes.find(t => t.id === 'github-dark')).toBeDefined();
    });
  });

  describe('getTheme()', () => {
    it('should return theme by ID', () => {
      const theme = getTheme('github-dark');
      expect(theme).toBeDefined();
      expect(theme!.name).toBe('GitHub Dark');
    });

    it('should return undefined for unknown ID', () => {
      expect(getTheme('nonexistent')).toBeUndefined();
    });
  });

  describe('getSavedTheme()', () => {
    it('should return default theme when nothing saved', () => {
      localStorage.clear();
      expect(getSavedTheme()).toBe('github-dark');
    });

    it('should return saved theme from localStorage', () => {
      localStorage.setItem('mdviz-theme', 'dracula');
      expect(getSavedTheme()).toBe('dracula');
      localStorage.removeItem('mdviz-theme');
    });
  });

  describe('theme color values', () => {
    it('all color values should be valid CSS color strings', () => {
      for (const theme of themes) {
        for (const [key, value] of Object.entries(theme.colors)) {
          expect(typeof value).toBe('string');
          expect(value.length, `${theme.id}.${key} is empty`).toBeGreaterThan(0);
        }
      }
    });

    it('light themes should have light backgrounds', () => {
      for (const theme of themes.filter(t => t.type === 'light')) {
        const bg = theme.colors['--bg-primary'];
        // Light themes should start with high hex values (#c-#f) or white
        expect(bg, `${theme.id} bg-primary: ${bg}`).toMatch(/^#[c-fC-F]/);
      }
    });

    it('dark themes should have dark backgrounds', () => {
      for (const theme of themes.filter(t => t.type === 'dark')) {
        const bg = theme.colors['--bg-primary'];
        // Dark themes should start with low hex values (#0-#4)
        expect(bg, `${theme.id} bg-primary: ${bg}`).toMatch(/^#[0-4]/);
      }
    });
  });
});
