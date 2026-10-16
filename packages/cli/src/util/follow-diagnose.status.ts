/** Which statuses count as finished, and the two places that question is asked. */

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED", "ERROR"]);

export function isTerminalStatus(status: string | undefined | null): boolean {
  return !!status && TERMINAL_STATUSES.has(status);
}

/** True once an iteration reached a terminal-ish state. */
export function isIterationDone(status: string): boolean {
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
