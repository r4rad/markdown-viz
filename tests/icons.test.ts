import { describe, it, expect, vi, beforeEach } from 'vitest';
import { icon, iconEl } from '../src/components/icons';

describe('Icons', () => {
  describe('icon()', () => {
    it('should return SVG markup for known icons', () => {
      const result = icon('bold');
      expect(result).toContain('<svg');
      expect(result).toContain('</svg>');
      expect(result).toContain('<span class="icon');
    });

    it('should return empty span for unknown icons', () => {
      const result = icon('nonexistent-icon');
      expect(result).toContain('<span class="icon');
      expect(result).not.toContain('<svg');
    });

    it('should add custom class', () => {
      const result = icon('bold', 'custom-class');
      expect(result).toContain('class="icon custom-class"');
    });

    it('should return all required icons', () => {
      const requiredIcons = [
        'logo', 'plus', 'x', 'bold', 'italic', 'code', 'link', 'image',
        'list', 'table', 'eye', 'edit', 'columns', 'sync', 'download',
        'upload', 'wand', 'palette', 'user', 'github', 'google', 'gear',
        'heading', 'quote', 'hr', 'checklist', 'cloud-sync', 'share',
        'copy', 'cursor', 'scroll-link',
      ];
      for (const name of requiredIcons) {
        const result = icon(name);
        expect(result, `Missing icon: ${name}`).toContain('<svg');
      }
    });
  });

  describe('iconEl()', () => {
    it('should return an HTMLSpanElement', () => {
      const el = iconEl('bold');
      expect(el).toBeInstanceOf(HTMLSpanElement);
      expect(el.className).toBe('icon');
    });

    it('should contain SVG for known icons', () => {
      const el = iconEl('bold');
      expect(el.innerHTML).toContain('<svg');
    });

    it('should return empty span for unknown icons', () => {
      const el = iconEl('unknown');
      expect(el.innerHTML).toBe('');
    });
  });
});
