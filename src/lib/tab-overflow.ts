/** Pure helpers for which open tabs fit in the tab strip. */

export type TabOverflowInput = {
  id: string;
  name: string;
  lastOpenedAt?: number;
};

export type TabOverflowResult = {
  /** Ids to show in the strip, in the same relative order as `tabs`. */
  visibleIds: string[];
  /** Ids only available from the overflow menu (most recent first). */
  overflowIds: string[];
};

/** Approximate rendered tab width from the name (matches CSS max-width ~180). */
export function estimateTabWidth(name: string, maxWidth = 180): number {
  const padding = 36; // horizontal padding + close affordance
  const char = 7.2;
  return Math.min(maxWidth, Math.max(72, padding + name.length * char));
}

/**
 * Pick strip tabs by available width, always keeping the active tab visible and
 * preferring most recently opened tabs for the remaining slots.
 */
export function selectVisibleTabIds(
  tabs: TabOverflowInput[],
  activeTabId: string | null,
  availableWidth: number,
  options?: { overflowChromeWidth?: number; measure?: (tab: TabOverflowInput) => number },
): TabOverflowResult {
  if (tabs.length === 0) return { visibleIds: [], overflowIds: [] };

  const chrome = options?.overflowChromeWidth ?? 36;
  const measure = options?.measure ?? ((t) => estimateTabWidth(t.name));
  const budget = Math.max(0, availableWidth - chrome);

  const byId = new Map(tabs.map((t) => [t.id, t]));
  const active = activeTabId && byId.has(activeTabId) ? activeTabId : tabs[0]!.id;

  const chosen = new Set<string>([active]);
  let used = measure(byId.get(active)!);

  const byRecency = [...tabs].sort(
    (a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || a.name.localeCompare(b.name),
  );

  for (const tab of byRecency) {
    if (chosen.has(tab.id)) continue;
    const w = measure(tab);
    if (used + w > budget) continue;
    chosen.add(tab.id);
    used += w;
  }

  // If even the active tab alone exceeds the budget, still show only it.
  const visibleIds = tabs.filter((t) => chosen.has(t.id)).map((t) => t.id);
  const overflowIds = byRecency.filter((t) => !chosen.has(t.id)).map((t) => t.id);
  return { visibleIds, overflowIds };
}
