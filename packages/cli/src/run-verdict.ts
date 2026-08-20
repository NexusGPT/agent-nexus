import { CLI_RUN_CANCELLED, CLI_RUN_UNFINISHED, printFailure, reportFailure } from "./errors";
import { EXIT_CODES } from "./exit-codes";

/**
 * THE ONE PLACE THIS CLI DECIDES WHAT A WORKFLOW RUN'S STATUS MEANS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `CANCELLED` IS NOT `FAILED`, AND `RUNNING` IS NEITHER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `execution diagnose` and `execution poll` both print a run's status and exited
 * `0` over every value of it. `poll --watch` is the sharp one: it stops at
 * COMPLETED, FAILED **or** CANCELLED and answered `0` on all three, so a wait
 * loop written around it could not tell a run that finished from one that failed
 * without re-reading the document it had just printed. `diagnose`'s help opens
 * with START HERE, which makes it the first thing a debugging script calls and
 * the first thing that told it nothing.
 *
 * `WorkflowExecutionStatus` has exactly five values — `PENDING`, `RUNNING`,
 * `COMPLETED`, `FAILED`, `CANCELLED` — and they fall into FOUR outcomes and
 * THREE exit categories:
 *
 * | status              | outcome      | exit category  |
 * | ------------------- | ------------ | -------------- |
 * | `COMPLETED`         | `completed`  | `success`      |
 * | `FAILED`            | `failed`     | `remote-error` |
 * | `CANCELLED`         | `cancelled`  | `unmeasured`   |
 * | `PENDING` `RUNNING` | `in-flight`  | `unmeasured`   |
 *
 * ⚠️ A CANCELLED RUN DID NOT FAIL, AND THE TWO CARRY OPPOSITE INSTRUCTIONS.
 * Somebody stopped it, so the platform never judged the result — its nodes may
 * have done everything, nothing, or half. Reporting that as a failure sends the
 * reader to debug a workflow that was never given the chance to be wrong.
 * `unmeasured` is the category `exit-codes.ts` declares for exactly this: "THIS
 * IS NOT A FAILURE AND IT IS NOT A SUCCESS."
 *
 * `cancelled` and `in-flight` share an exit CODE and never share a `code` field,
 * because the reader's next move differs: one run is over and one is not.
 *
 * An unrecognised status is `in-flight` rather than a pass. "The platform said
 * something this CLI build does not know" is an absence of measurement, and a
 * terminal state added upstream must never read as green here by default.
 */

/** What a run's status says. A CLOSED union, so no failure falls through a default. */
export type RunVerdict =
  /** The run finished and the platform judged it good. The only `0` arm. */
  | { readonly outcome: "completed" }
  /** The run finished and the platform judged it bad. */
  | { readonly outcome: "failed" }
  /** Somebody stopped it. Nothing was judged. */
  | { readonly outcome: "cancelled" }
  /** It has not finished — or it reports a state this build does not know. */
  | { readonly outcome: "in-flight"; readonly status: string };

/** Every arm that is not a completion, so a caller that forgets to branch is a type error. */
export type UnfinishedRunVerdict = Exclude<RunVerdict, { outcome: "completed" }>;

export function judgeRunStatus(status: string): RunVerdict {
  if (status === "COMPLETED") return { outcome: "completed" };
  if (status === "FAILED") return { outcome: "failed" };
  if (status === "CANCELLED") return { outcome: "cancelled" };
  return { outcome: "in-flight", status };
}

/**
 * PRINT the refusal an unfinished run means and RETURN its exit code.
 *
 * ⚠️ ASSIGN THE RETURN VALUE. `reportFailure` and `printFailure` only write the
 * document; a bare call here emits a perfect error and exits `0`, which is the
 * class this change is draining.
 */
export function reportRunRefusal(verdict: UnfinishedRunVerdict, executionId: string): number {
  if (verdict.outcome === "failed") {
    // `remote-error`: the invocation was ACCEPTED and the platform answered that
    // the run under inspection failed. The caller's next move is to fix the
    // workflow, not the command line — the same taxonomy choice as
    // `external-tool test-auth`.
    return reportFailure(
      "remote-error",
      `Execution ${executionId} FAILED.`,
      'Read the failing node with "nexus execution diagnose <id>" — its `error` field names the first failure found walking the tree.'
    );
  }

  if (verdict.outcome === "cancelled") {
    printFailure(
      `Execution ${executionId} was CANCELLED — it was stopped before the platform could judge it.`,
      CLI_RUN_CANCELLED,
      "Nothing failed and nothing passed. A cancelled run may have done everything, nothing, or half of it; the exit code is UNMEASURED, never a failure."
    );
    return EXIT_CODES.unmeasured;
  }

  printFailure(
    `Execution ${executionId} reports "${verdict.status}" — it has not finished.`,
    CLI_RUN_UNFINISHED,
    'Nothing failed and nothing passed. Wait for a terminal status with "nexus execution poll <id> --watch"; the exit code is UNMEASURED, never a failure.'
  );
  return EXIT_CODES.unmeasured;
}
