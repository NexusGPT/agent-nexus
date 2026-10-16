/**
 * The shapes `--follow` reads and the shape it prints.
 *
 * Declared here rather than beside any one reader because the flattener, the
 * differ and the formatter all speak in {@link FollowEntry}, and the payload
 * types come straight off the diagnose endpoint.
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
