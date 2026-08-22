/** Unified Markdown source diff (not HTML). */
export function unifiedDiff(a: string, b: string, aLabel = 'a', bLabel = 'b'): string {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const lines = [`--- ${aLabel}`, `+++ ${bLabel}`];
  const max = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < max; i++) {
    const left = aLines[i];
    const right = bLines[i];
    if (left === right) {
      if (left !== undefined) lines.push(` ${left}`);
    } else {
      if (left !== undefined) lines.push(`-${left}`);
      if (right !== undefined) lines.push(`+${right}`);
    }
  }
  return lines.join('\n');
}
