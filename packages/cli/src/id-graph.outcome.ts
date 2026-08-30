import { CLI_INVALID_ARGUMENTS } from "./errors";
import { exitCategoryFor } from "./exit-codes";
import { isClientSideRefusal } from "./id-graph.refusal";

/**
 * WHAT ONE LEAF'S INVOCATION MEANS. The four-outcome contract, as a pure
 * function.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS IN `src/` AND NOT IN THE RUNNER
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It lived in `scripts/id-thread-sweep.ts`, which ends in `main()` — importing
 * that file RUNS the sweep, so no spec could reach this mapping and every proof
 * of it was a fixture run somebody performed by hand. The exact defect this
 * module's sibling `id-graph.refusal.ts` was extracted to fix, one level up, and
 * it went unnoticed for the same reason: the person checking it was the person
 * running it, so it always felt exercised.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE CONTRACT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   REACHED              invoked, exit 0, parseable JSON, no credential.
 *   SKIPPED_NO_ID        its producer returned zero rows. Decided upstream of
 *                        this function, which never sees that case.
 *   SKIPPED_NEEDS_INPUT  the CLI refused BEFORE SENDING ANYTHING — a fact about
 *                        what the harness supplied, not about the route.
 *   FAILED               anything else non-zero.
 *
 * 🚨 A NON-ZERO EXIT IS NOT AUTOMATICALLY A FAILURE, AND IT IS NOT AUTOMATICALLY
 * A SKIP EITHER. Reading every non-zero as FAILED produced five false failures
 * against live staging on healthy routes. Reading the whole `invalid-input`
 * CATEGORY as a skip then produced the inverse and worse defect: a 400, 409 or
 * 422 shares that category, and after admission those mean the server rejected a
 * COMPLETE request — a broken route recorded as a skip, with the run still
 * exiting 0.
 *
 * So the exit code chooses the CATEGORY and the error DOCUMENT chooses between
 * the two things that category can mean. See {@link isClientSideRefusal}, whose
 * default is `false` because FAILED is the loud direction.
 */
export type LeafOutcome = "REACHED" | "SKIPPED_NO_ID" | "SKIPPED_NEEDS_INPUT" | "FAILED";

export interface OutcomeVerdict {
  readonly status: LeafOutcome;
  /** Why, for the report. Never contains an unscanned response body. */
  readonly note: string;
}

/**
 * The verdict for a leaf that exited NON-ZERO.
 *
 * `output` is stdout and stderr concatenated, exactly as the runner captures
 * them — the document is pretty-printed and may sit among other stream text.
 */
export function outcomeForExitCode(code: number, output: string): OutcomeVerdict {
  const category = exitCategoryFor(code);
  const detail = output.trim().slice(0, 120);

  if (category === "invalid-input" && isClientSideRefusal(output)) {
    return {
      status: "SKIPPED_NEEDS_INPUT",
      note: `the CLI refused before sending anything (${CLI_INVALID_ARGUMENTS}): ${detail}`
    };
  }

  return {
    status: "FAILED",
    note: `exit=${code}${category ? ` (${category})` : ""}: ${detail}`
  };
}
