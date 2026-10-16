import type { PathCandidate } from "./resolve-on-path.model";

/** Longest failure text shown INSIDE a resolution row, before it is elided. */
const ROW_FAILURE_LIMIT = 48;

/**
 * The resolution list as a reader sees it — every entry, the winner marked.
 *
 * ONE LINE PER ARRAY ELEMENT, never a single string with newlines in it. The
 * caller joins its hint with an indent, and an embedded newline skips that
 * indent — which silently un-aligns exactly the block whose alignment is the
 * diagnostic. Returning lines makes the caller's join reach all of them.
 *
 * Marking the WINNER rather than the newest is deliberate. The reader's next
 * action is to remove or outrank one specific file, and the arrow names it.
 */
export function formatResolutionList(candidates: readonly PathCandidate[]): string[] {
  const width = Math.max(...candidates.map((c) => c.path.length), 0);

  return candidates.map((candidate, index) => {
    const marker = index === 0 ? "→" : " ";
    const tail = index === 0 ? "   ← your shell runs this one" : "";
    return `  ${marker} ${candidate.path.padEnd(width)}  ${describeRow(candidate)}${tail}`;
  });
}

/**
 * What one row says in its version column.
 *
 * A failure is shortened to its first line and elided, because the row is a
 * COLUMN and a full stack trace in it destroys the alignment that makes the
 * list readable. The unabridged text is printed above the list by the caller
 * for the entry that actually matters — the one the shell runs.
 */
function describeRow(candidate: PathCandidate): string {
  if (candidate.version !== null) return candidate.version;

  const reason = (candidate.failure ?? "no version").split("\n")[0];
  const short =
    reason.length > ROW_FAILURE_LIMIT ? `${reason.slice(0, ROW_FAILURE_LIMIT - 1)}…` : reason;
  return `(${short})`;
}
