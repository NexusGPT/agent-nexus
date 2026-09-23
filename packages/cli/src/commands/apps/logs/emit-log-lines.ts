import { isJsonMode } from "../../../output";
import type { VibeLogLineDto } from "../../../vibe-wire-types";
import { formatLogLine } from "./format-log-line";

/**
 * Print lines, in whichever mode is active.
 *
 * Everything here goes to stdout and NOTHING else does — notes, warnings and
 * failures are stderr, so `--json` on stdout stays a clean NDJSON stream that a
 * consumer can pipe without filtering.
 *
 * ## NDJSON in BOTH modes, never a JSON array
 *
 * An array cannot be emitted incrementally: its closing bracket only exists once
 * the stream ends, and a follow does not end. `--follow --json | jq` would hang
 * forever. So `--json` emits one object per line in both modes, and the shape a
 * consumer parses does not change depending on which flags they passed. This
 * differs from every other `--json` surface in the CLI, and it is deliberate.
 */
export function emitLogLines(lines: readonly VibeLogLineDto[]): void {
  if (isJsonMode()) {
    for (const line of lines) console.log(JSON.stringify(line));
    return;
  }
  for (const line of lines) console.log(formatLogLine(line));
}
