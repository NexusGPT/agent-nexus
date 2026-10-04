import path from "node:path";
import { fileURLToPath } from "node:url";

/** One check-shaped leaf that emits a verdict field with no exit path from it. */
export interface VerdictWithoutExit {
  /** Path relative to `src/`, e.g. `commands/external-tool.ts`. */
  readonly file: string;
  /** The commander object the leaf hangs off, e.g. `externalTool`. */
  readonly receiver: string;
  /** The leaf command name, e.g. `test`. */
  readonly command: string;
  /** 1-based line of the `.action(...)` call. */
  readonly line: number;
  /** The verdict field emitted with no exit path. */
  readonly field: string;
}

/** `commands/external-tool.ts externalTool.test status` — stable across edits above it. */
export function verdictKey(finding: {
  readonly file: string;
  readonly receiver: string;
  readonly command: string;
  readonly field: string;
}): string {
  return `${finding.file} ${finding.receiver}.${finding.command} ${finding.field}`;
}

/**
 * `src/` of this package, resolved from THIS file so the cwd cannot change it.
 *
 * 🚨 THE `..` COUNT IS THIS FILE'S OWN DEPTH, SO MOVING THIS FUNCTION MOVES THE
 * SCAN ROOT — SILENTLY, AND IN THE DIRECTION THAT SHRINKS IT. This file sits at
 * `src/commands/status-verdict/`, so reaching `src/` is TWO levels up. When it
 * lived in `src/commands/status-verdict.scan.ts` it was one, and the split
 * carried the one-level form down a directory with it: the root became
 * `src/commands/`, every scan walked a smaller tree, and nothing was red —
 * `scanVerdictsWithoutExit` still returned 0 and `scanCheckVerbEmissions` still
 * returned its 15 keys, because every check verb happens to live under
 * `commands/`. The tell was the `file` field on those keys losing its
 * `commands/` prefix, which is the only place a smaller population showed.
 *
 * Caught by diffing the scan's own output before and after the move. A count
 * could not have caught it: both counts were 15.
 */
export function defaultScanRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}
