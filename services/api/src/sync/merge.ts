/**
 * Line-based three-way merge for Markdown documents.
 * Non-overlapping edits auto-merge; overlapping hunks yield a conflict.
 */

export type ThreeWayMergeResult =
  | { ok: true; merged: string; conflict: false }
  | {
      ok: false;
      conflict: true;
      /** Kept as local for blocked sync until resolve. */
      merged: string;
      /** Unified conflict markers for editor preview. */
      conflicted: string;
    };

export type DiffHunk = {
  /** Inclusive start index into base lines. */
  baseStart: number;
  /** Exclusive end index into base lines. */
  baseEnd: number;
  replacement: string[];
};

function splitLines(text: string): string[] {
  return text.split('\n');
}

function joinLines(lines: string[]): string {
  return lines.join('\n');
}

/**
 * Compute hunks transforming `base` into `side` by walking both sequences.
 * Consecutive unequal runs collapse into one hunk.
 */
export function diffHunks(base: string[], side: string[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let i = 0;
  let j = 0;

  while (i < base.length || j < side.length) {
    if (i < base.length && j < side.length && base[i] === side[j]) {
      i += 1;
      j += 1;
      continue;
    }

    const baseStart = i;
    const sideStart = j;

    // Consume a mismatch run until the next equal pair (greedy: prefer
    // earliest common line appearing in both remaining suffixes).
    while (i < base.length || j < side.length) {
      if (i < base.length && j < side.length && base[i] === side[j]) break;

      const baseIdxInSide =
        i < base.length ? side.indexOf(base[i]!, j) : -1;
      const sideIdxInBase =
        j < side.length ? base.indexOf(side[j]!, i) : -1;

      if (
        i < base.length &&
        j < side.length &&
        baseIdxInSide >= 0 &&
        sideIdxInBase >= 0
      ) {
        // Both can realign — take the closer realign.
        if (baseIdxInSide - j <= sideIdxInBase - i) {
          // Consume side lines until base[i].
          j = baseIdxInSide;
        } else {
          i = sideIdxInBase;
        }
        break;
      }
      if (i < base.length && baseIdxInSide >= 0) {
        j = baseIdxInSide;
        break;
      }
      if (j < side.length && sideIdxInBase >= 0) {
        i = sideIdxInBase;
        break;
      }
      if (i < base.length) i += 1;
      if (j < side.length) j += 1;
      if (i >= base.length && j >= side.length) break;
    }

    hunks.push({
      baseStart,
      baseEnd: i,
      replacement: side.slice(sideStart, j),
    });
  }

  return hunks;
}

function hunksOverlap(a: DiffHunk, b: DiffHunk): boolean {
  return a.baseStart < b.baseEnd && b.baseStart < a.baseEnd;
}

/**
 * Three-way merge: base + local + remote.
 * WHEN both sides change overlapping base regions → conflict.
 * OTHERWISE → auto-merged text.
 */
export function threeWayMerge(
  baseContent: string,
  localContent: string,
  remoteContent: string,
): ThreeWayMergeResult {
  if (localContent === remoteContent) {
    return { ok: true, merged: localContent, conflict: false };
  }
  if (localContent === baseContent) {
    return { ok: true, merged: remoteContent, conflict: false };
  }
  if (remoteContent === baseContent) {
    return { ok: true, merged: localContent, conflict: false };
  }

  const base = splitLines(baseContent);
  const local = splitLines(localContent);
  const remote = splitLines(remoteContent);

  const localHunks = diffHunks(base, local);
  const remoteHunks = diffHunks(base, remote);

  for (const lh of localHunks) {
    for (const rh of remoteHunks) {
      if (hunksOverlap(lh, rh)) {
        const conflicted = [
          '<<<<<<< local',
          localContent,
          '=======',
          remoteContent,
          '>>>>>>> remote',
        ].join('\n');
        return {
          ok: false,
          conflict: true,
          merged: localContent,
          conflicted,
        };
      }
    }
  }

  // Apply remote then local hunks from the end of the base so indices stay valid.
  const out = [...base];
  const ordered = [...remoteHunks, ...localHunks].sort(
    (a, b) => b.baseStart - a.baseStart || b.baseEnd - a.baseEnd,
  );

  for (const hunk of ordered) {
    out.splice(hunk.baseStart, hunk.baseEnd - hunk.baseStart, ...hunk.replacement);
  }

  return { ok: true, merged: joinLines(out), conflict: false };
}
