/**
 * A small line diff for the bundle delta: counts per file, and the changed lines
 * of one file with context. Longest-common-subsequence, so it is quadratic — the
 * size cap is what keeps a large hook file from stalling the release job.
 */

/** Above this many cells the line diff is not computed — the file is named, not counted. */
const MAX_DIFF_CELLS = 4_000_000;

type LineOp = { op: " " | "-" | "+"; line: string };

/** A longest-common-subsequence line diff. Small inputs only — callers check the size. */
function lineDiff(before: string, after: string): LineOp[] {
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");
  const rows = a.length + 1;
  const cols = b.length + 1;
  const lcs = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * cols + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * cols + j + 1] + 1
          : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + j + 1]);
    }
  }
  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ op: " ", line: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[(i + 1) * cols + j] >= lcs[i * cols + j + 1]) {
      ops.push({ op: "-", line: a[i] });
      i += 1;
    } else {
      ops.push({ op: "+", line: b[j] });
      j += 1;
    }
  }
  while (i < a.length) ops.push({ op: "-", line: a[i++] });
  while (j < b.length) ops.push({ op: "+", line: b[j++] });
  return ops;
}

export function lineCounts(before: string, after: string): string {
  const cells = (before.split("\n").length + 1) * (after.split("\n").length + 1);
  if (cells > MAX_DIFF_CELLS) {
    // Too large for the exact diff: count lines present on one side and not the
    // other, as multisets. A moved line counts as unchanged, so this can only
    // UNDER-count — the `≈` says so.
    const remaining = new Map<string, number>();
    for (const line of before.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
    let added = 0;
    for (const line of after.split("\n")) {
      const left = remaining.get(line) ?? 0;
      if (left > 0) remaining.set(line, left - 1);
      else added += 1;
    }
    const removed = [...remaining.values()].reduce((n, v) => n + v, 0);
    return `≈+${added} −${removed}`;
  }
  const ops = lineDiff(before, after);
  const added = ops.filter((o) => o.op === "+").length;
  const removed = ops.filter((o) => o.op === "-").length;
  return `+${added} −${removed}`;
}

/** Only the changed lines and three lines of context around each run of them. */
export function renderDiff(before: string, after: string): string[] {
  const ops = lineDiff(before, after);
  const keep = new Set<number>();
  ops.forEach((o, k) => {
    if (o.op === " ") return;
    for (let c = Math.max(0, k - 3); c <= Math.min(ops.length - 1, k + 3); c += 1) keep.add(c);
  });
  const out: string[] = [];
  let last = -1;
  for (const k of [...keep].sort((x, y) => x - y)) {
    if (last !== -1 && k !== last + 1) out.push("@@");
    out.push(`${ops[k].op}${ops[k].line}`);
    last = k;
  }
  return out;
}
