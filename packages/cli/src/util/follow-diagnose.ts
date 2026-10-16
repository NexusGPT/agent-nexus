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
 *
 * ── WHERE EACH PART LIVES ───────────────────────────────────────────────────
 *
 * This file is the entry point and declares nothing of its own, so every
 * importer keeps one import path while each concern stays its own module:
 *
 *   `.model.ts`    the diagnose payload, and the flattened entry printed from it
 *   `.status.ts`   which statuses count as finished, for a node and for an
 *                  iteration
 *   `.flatten.ts`  one snapshot to an ordered list, recursing into iterations
 *   `.diff.ts`     the per-entry signature, and what changed since last poll
 *   `.format.ts`   a duration, a follow line, and the `[wf …]` tag
 */

export { diffSnapshots, entrySignature } from "./follow-diagnose.diff";
export { flattenDiagnose } from "./follow-diagnose.flatten";
export { formatDuration, formatFollowLine, shortTag } from "./follow-diagnose.format";
export type { DiagnoseNode, DiagnoseResult, FollowEntry } from "./follow-diagnose.model";
export { isTerminalStatus } from "./follow-diagnose.status";
