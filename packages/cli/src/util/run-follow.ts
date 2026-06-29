import { color } from "../output";
import {
  type DiagnoseResult,
  diffSnapshots,
  flattenDiagnose,
  type FollowEntry,
  formatFollowLine,
  isTerminalStatus,
  shortTag} from "./follow-diagnose";

interface FollowClient {
  workflowExecutions: {
    diagnose: (executionId: string, options?: { verbose?: boolean }) => Promise<unknown>;
  };
}

export interface RunFollowOptions {
  /** Poll interval in ms. */
  interval: number;
  /** Tag used in the `[wf …]` prefix (short workflow id). */
  wfTag: string;
  /** Emit NDJSON of changed entries instead of human lines. */
  json: boolean;
  /** Safety cap on total polls (avoids an unbounded loop if status never flips). */
  maxPolls?: number;
}

function colorizeStatus(line: string, status: string): string {
  const paint =
    status === "COMPLETED"
      ? color.green
      : status === "FAILED" || status === "ERROR" || status === "CANCELLED"
        ? color.red
        : status === "RUNNING"
          ? color.yellow
          : color.dim;
  // Colour the real status token, not an earlier accidental match inside the
  // node label (e.g. a node named `handle ERROR` with status `ERROR`).
  // `formatFollowLine` always emits the status preceded by a space and followed
  // by exactly one of: end-of-line, ` in ` (duration), or ` — ` (a suffix
  // segment). A node label never produces that trailing context, so anchoring
  // on it pins the replacement to the real status token. The match is also
  // greedy on the preceding text so any earlier same-word occurrence in the
  // label is skipped.
  const escaped = status.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const statusRe = new RegExp(`^(.*\\s)(${escaped})( in | — |$)`);
  return line.replace(statusRe, (_m, head: string, s: string, tail: string) => `${head}${paint(s)}${tail}`);
}

function emit(entry: FollowEntry, opts: RunFollowOptions): void {
  if (opts.json) {
    console.log(JSON.stringify({ ...entry, wfTag: opts.wfTag }));
    return;
  }
  console.log(colorizeStatus(formatFollowLine(entry, opts.wfTag), entry.status));
}

/**
 * Follow an execution to completion by polling `diagnose` and printing per-node
 * state changes as they happen. Returns the final execution status.
 */
export async function runFollow(
  client: FollowClient,
  executionId: string,
  opts: RunFollowOptions
): Promise<string> {
  let signatures = new Map<string, string>();
  const maxPolls = opts.maxPolls ?? 10_000;
  let finalStatus = "UNKNOWN";

  for (let poll = 0; poll < maxPolls; poll++) {
    const diag = (await client.workflowExecutions.diagnose(executionId, {
      verbose: false
    })) as DiagnoseResult;

    const entries = flattenDiagnose(diag);
    const { changed, next } = diffSnapshots(signatures, entries);
    signatures = next;
    for (const entry of changed) emit(entry, opts);

    finalStatus = diag.status ?? "UNKNOWN";
    if (isTerminalStatus(finalStatus)) break;

    await new Promise((resolve) => setTimeout(resolve, opts.interval));
  }

  return finalStatus;
}

export { shortTag };
