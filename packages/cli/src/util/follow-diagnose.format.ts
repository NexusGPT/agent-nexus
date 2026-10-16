import type { FollowEntry } from "./follow-diagnose.model";
import { isTerminalStatus } from "./follow-diagnose.status";

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
