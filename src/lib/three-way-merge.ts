/**
 * Line-based three-way merge (SPA mirror of services/api sync/merge).
 * Used for conflict preview in the resolve modal.
 */

export type ThreeWayMergeResult =
  | { ok: true; merged: string; conflict: false }
  | {
      ok: false;
      conflict: true;
      merged: string;
      conflicted: string;
    };

export type DiffHunk = {
  baseStart: number;
  baseEnd: number;
  replacement: string[];
};

function splitLines(text: string): string[] {
  return text.split('\n');
}

function joinLines(lines: string[]): string {
  return lines.join('\n');
}

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

    while (i < base.length || j < side.length) {
      if (i < base.length && j < side.length && base[i] === side[j]) break;

      const baseIdxInSide = i < base.length ? side.indexOf(base[i]!, j) : -1;
      const sideIdxInBase = j < side.length ? base.indexOf(side[j]!, i) : -1;

      if (
        i < base.length &&
        j < side.length &&
        baseIdxInSide >= 0 &&
        sideIdxInBase >= 0
      ) {
        if (baseIdxInSide - j <= sideIdxInBase - i) j = baseIdxInSide;
        else i = sideIdxInBase;
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

  const out = [...base];
  const ordered = [...remoteHunks, ...localHunks].sort(
    (a, b) => b.baseStart - a.baseStart || b.baseEnd - a.baseEnd,
  );
  for (const hunk of ordered) {
    out.splice(hunk.baseStart, hunk.baseEnd - hunk.baseStart, ...hunk.replacement);
  }
  return { ok: true, merged: joinLines(out), conflict: false };
}
