/**
 * Pure helpers for `--follow` / `nexus execution follow` (NEX-2053).
 *
 * The backend has no per-node streaming channel — execution status is
 * poll-based. We reconstruct a live, node-by-node view client-side by polling
 * the existing `diagnose` endpoint and printing only what changed since the last
 * poll. Loop iterations are addressed individually (the diagnose payload nests
 * each iteration's nodes), which is the only way to see the output of one
 * specific iteration of an inner-loop plugin node.
 *
 * These helpers are deliberately framework-free (no I/O, no colour, no timers)
 * so the diff logic is unit-testable.
 */

/** A single node entry inside a diagnose payload (recursive for loops). */
export interface DiagnoseNode {
  nodeId?: string;
  label?: string | null;
  nodeType?: string | null;
  status?: string;
  duration?: number | null;
  error?: string | null;
  outputSummary?: string | null;
  loopIterations?: Array<{
    iteration: number;
    status: string;
    nodes?: DiagnoseNode[];
  }> | null;
}

/** Top-level diagnose payload. */
export interface DiagnoseResult {
  executionId?: string;
  status?: string;
  workflowName?: string | null;
  nodes?: DiagnoseNode[];
}

/** A flattened, printable line item derived from a diagnose snapshot. */
export interface FollowEntry {
  /** Stable identity across polls (path through loop iterations). */
  key: string;
  /** Human path label, e.g. `loop_companies iter 0: workday_search`. */
  pathLabel: string;
  type: string | null;
  status: string;
  duration: number | null;
  outputSummary: string | null;
  error: string | null;
  /**
   * Present for loop nodes — iteration progress so far. `total` is only known
   * once the loop node itself is terminal: the diagnose payload materializes
   * iteration entries progressively (sequential loops, and parallel loops with
   * more than one batch, spawn sub-executions as they run), so while the loop is
   * still RUNNING the number of present iteration entries is NOT the planned
   * total. We therefore omit `total` until the loop finishes to avoid printing a
   * misleading ratio like `1/1` for a loop that will ultimately run 5 times.
   */
  loopProgress?: { done: number; total: number | null };
}

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED", "ERROR"]);

export function isTerminalStatus(status: string | undefined | null): boolean {
  return !!status && TERMINAL_STATUSES.has(status);
}

/** True once an iteration reached a terminal-ish state. */
function isIterationDone(status: string): boolean {
  // Mirror isTerminalStatus (which counts CANCELLED) plus SKIPPED, so a
  // cancelled iteration is still tallied in loopProgress.done and the ratio
  // doesn't undercount finished iterations.
  return (
    status === "COMPLETED" ||
    status === "FAILED" ||
    status === "ERROR" ||
    status === "CANCELLED" ||
    status === "SKIPPED"
  );
}

/**
 * Flatten a diagnose snapshot into an ordered list of printable entries,
 * recursing into loop iterations so each inner node is individually addressable.
 */
export function flattenDiagnose(diag: DiagnoseResult): FollowEntry[] {
  const entries: FollowEntry[] = [];

  const walk = (nodes: DiagnoseNode[] | undefined, keyPrefix: string, labelPrefix: string) => {
    for (const node of nodes ?? []) {
      const nodeId = node.nodeId ?? "unknown";
      const key = keyPrefix ? `${keyPrefix}>${nodeId}` : nodeId;
      const name = node.label ?? nodeId;
      const pathLabel = `${labelPrefix}${name}`;

      const iterations = node.loopIterations ?? null;
      // The diagnose payload only carries iteration entries that have already
      // been spawned, so `iterations.length` equals the planned total ONLY once
      // the loop node itself is terminal. While the loop is still running we
      // know how many iterations are done but not how many remain.
      const loopNodeDone = isTerminalStatus(node.status);
      const loopProgress =
        iterations && iterations.length > 0
          ? {
              done: iterations.filter((i) => isIterationDone(i.status)).length,
              total: loopNodeDone ? iterations.length : null
            }
          : undefined;

      entries.push({
        key,
        pathLabel,
        type: node.nodeType ?? null,
        status: node.status ?? "PENDING",
        duration: node.duration ?? null,
        outputSummary: node.outputSummary ?? null,
        error: node.error ?? null,
        loopProgress
      });

      // Recurse into iterations. Iteration numbers from diagnose are 1-based;
      // present them 0-based to match the issue's `iter 0` convention.
      if (iterations) {
        for (const iter of iterations) {
          walk(iter.nodes, `${key}#iter${iter.iteration}`, `${name} iter ${iter.iteration - 1}: `);
        }
      }
    }
  };

  walk(diag.nodes, "", "");
  return entries;
}

/** A change signature for an entry — when this differs, we reprint the line. */
export function entrySignature(e: FollowEntry): string {
  return [
    e.status,
    e.duration == null ? "" : "d",
    e.outputSummary ?? "",
    e.error ?? "",
    e.loopProgress ? `${e.loopProgress.done}/${e.loopProgress.total ?? "?"}` : ""
  ].join("|");
}

/**
 * Compare a new set of entries against the previous signature map and return
 * the entries whose state changed (new nodes included), in order, plus the
 * updated signature map to carry into the next poll.
 */
export function diffSnapshots(
  prev: Map<string, string>,
  entries: FollowEntry[]
): { changed: FollowEntry[]; next: Map<string, string> } {
  const next = new Map<string, string>();
  const changed: FollowEntry[] = [];
  for (const e of entries) {
    const sig = entrySignature(e);
    next.set(e.key, sig);
    if (prev.get(e.key) !== sig) changed.push(e);
  }
  return { changed, next };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSecs = Math.round(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}m${secs}s`;
}

/**
 * Render one entry as a single follow line (plain text, no colour) matching the
 * shape from the issue:
 *   [wf bc4e2043] node read_companies (plugin) COMPLETED in 1.2s — output: 429 rows
 */
export function formatFollowLine(entry: FollowEntry, wfTag: string): string {
  const typePart = entry.type ? ` (${entry.type})` : "";
  let line = `[wf ${wfTag}] node ${entry.pathLabel}${typePart} ${entry.status}`;

  if (entry.duration != null && isTerminalStatus(entry.status)) {
    line += ` in ${formatDuration(entry.duration)}`;
  }
  if (entry.loopProgress) {
    // `total` is null while the loop is still running (planned count unknown
    // from the diagnose payload) — show just the completed count in that case.
    line +=
      entry.loopProgress.total != null
        ? ` — ${entry.loopProgress.done}/${entry.loopProgress.total} iterations done`
        : ` — ${entry.loopProgress.done} iterations done`;
  }
  if (entry.outputSummary && entry.status === "COMPLETED") {
    line += ` — output: ${entry.outputSummary}`;
  }
  if (entry.error) {
    line += ` — error: ${entry.error}`;
  }
  return line;
}

/** Short, stable tag for the `[wf …]` prefix. */
export function shortTag(id: string | undefined | null): string {
  if (!id) return "?";
  return id.split("-")[0] ?? id;
}
