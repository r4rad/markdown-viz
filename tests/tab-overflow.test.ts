import { describe, expect, it } from 'vitest';
import { estimateTabWidth, selectVisibleTabIds } from '../src/lib/tab-overflow';

describe('selectVisibleTabIds', () => {
  const tabs = [
    { id: 'a', name: 'a.md', lastOpenedAt: 1 },
    { id: 'b', name: 'b.md', lastOpenedAt: 3 },
    { id: 'c', name: 'c.md', lastOpenedAt: 2 },
    { id: 'd', name: 'older.md', lastOpenedAt: 0 },
  ];

  it('keeps tab order for visible ids and prefers recent for the strip', () => {
    const measure = () => 50;
    const result = selectVisibleTabIds(tabs, 'a', 160, {
      overflowChromeWidth: 40,
      measure,
    });
    // budget 120 after chrome → active a (50) + next recent b (50) + c (50) would be 150 > 120
    // so a + b only
    expect(result.visibleIds).toEqual(['a', 'b']);
    expect(result.overflowIds).toEqual(['c', 'd']);
  });

  it('always includes the active tab even if it is not the most recent', () => {
    const result = selectVisibleTabIds(tabs, 'd', 90, {
      overflowChromeWidth: 0,
      measure: () => 40,
    });
    // budget 90 → active d + most recent b (80); a/c overflow
    expect(result.visibleIds).toEqual(['b', 'd']);
    expect(result.overflowIds).toEqual(['c', 'a']);
  });

  it('puts everything in overflow except active when width is tiny', () => {
    const result = selectVisibleTabIds(tabs, 'c', 30, {
      overflowChromeWidth: 20,
      measure: () => 80,
    });
    expect(result.visibleIds).toEqual(['c']);
    expect(result.overflowIds).toEqual(['b', 'a', 'd']);
  });
});

describe('estimateTabWidth', () => {
  it('clamps between min and max', () => {
    expect(estimateTabWidth('x')).toBeGreaterThanOrEqual(72);
    expect(estimateTabWidth('a'.repeat(80))).toBe(180);
  });
});
