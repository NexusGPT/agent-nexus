import type { TestNodeResult } from "@agent-nexus/sdk";

import { errorMessageIn } from "./node-test-verdict.error-message";
import type { NodeTestVerdict } from "./node-test-verdict.types";

/**
 * THE ONE PLACE THIS CLI DECIDES WHETHER A SINGLE-NODE TEST PASSED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE VERDICT IS READ FROM `data`, NEVER FROM `status`.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `workflow test-node` and `workflow node test` are TWO SPELLINGS OF ONE
 * OPERATION — the same SDK method, the same endpoint, the same response — and
 * both printed `TestNodeResult` and exited `0` whatever it said. That is a double
 * false green, and the exit code is the cheaper half:
 *
 *   · `status` is the RUN's status, not the node's. It is a truthful field —
 *     `"FAILED"` when the executor threw, `"PENDING"` when the run went to the
 *     background, `"COMPLETED"` when it settled clean (NEX-4066) — but it
 *     describes the row the platform wrote, and a caller wants to know what the
 *     NODE did. Reading `data` answers that question directly and keeps working
 *     whatever the run-level enum grows next;
 *   · the outcome that matters is inside `data`, and the console reads it exactly
 *     the way this module does — `runOutput?.error || runOutput?.errorDetails`
 *     is the frontend's own test panel condition
 *     (`Nodes/Main/InternalTools/CustomScriptNode/TestSection.tsx`). One rule,
 *     two surfaces, so the CLI cannot disagree with the screen about whether the
 *     same node test failed. {@link errorMessageIn} is that rule, in a file of
 *     its own so there is one copy of it to read.
 *
 * ── WHY THIS IS A MODULE AND NOT A HELPER IN EACH FILE ──────────────────────
 *
 * The two spellings live in two files. A private copy in each is two things to
 * drift, and the drift is silent in the direction that reads as fine — one
 * spelling refusing while the other answers `0` for the same node is worse than
 * both being wrong, because a script that switched spellings would change
 * meaning without changing behaviour anywhere a reader can see. Same reasoning
 * as `auth-probe.ts`, which exists for the same reason across `auth status` and
 * `auth whoami`.
 *
 * ── THREE OUTCOMES, NEVER TWO ───────────────────────────────────────────────
 *
 * ⚠️ A NODE TEST THAT WENT ASYNCHRONOUS IS NOT A NODE TEST THAT PASSED. A plugin,
 * an `aiTask`, a `loop`, a `cueNode`, a `firecrawl`, an `exaai`, a `sixtyfour`
 * and most `parallelai` actions are dispatched to the background: the response
 * comes back immediately with `status: "PENDING"` and `data: null`. NOTHING WAS
 * MEASURED. Reporting that as `0` is the same defect this module exists to
 * close, one layer down — a script gating on the exit code would read "the node
 * works" off a run that had not started producing an answer.
 *
 * So the union in `node-test-verdict.types.ts` has three arms and they map to
 * three different exits:
 *
 * | outcome        | what happened                             | exit category  |
 * | -------------- | ----------------------------------------- | -------------- |
 * | `passed`       | the node ran and reported no error        | `success`      |
 * | `node-failed`  | the node ran and threw; `data` carries it | `remote-error` |
 * | `not-finished` | dispatched to the background, `data` null | `unmeasured`   |
 *
 * The CATEGORY, never the number — `exit-codes.ts` owns the integers and is the
 * only file allowed to write one. `unmeasured`'s own declaration there says it
 * "IS NOT A FAILURE AND IT IS NOT A SUCCESS", which is why it is deliberately
 * not `remote-error`: a caller must not go and debug a node that has not run.
 * `node-test-verdict.report.ts` turns a failed verdict into that exit.
 */

export { reportNodeTestRefusal } from "./node-test-verdict.report";
export type { FailedNodeTestVerdict, NodeTestVerdict } from "./node-test-verdict.types";

/** The run status the platform stamps on a test that produced an answer inline. */
const FINISHED_STATUS = "COMPLETED";

/**
 * Judge a single-node test result.
 *
 * Never throws and never guesses: an unrecognised `status` that produced no
 * error payload is `not-finished`, because "the platform said something this
 * CLI does not know" is an absence of measurement, not a pass.
 */
export function judgeNodeTest(result: TestNodeResult): NodeTestVerdict {
  const message = errorMessageIn(result.data);
  if (message !== null) return { outcome: "node-failed", message };

  if (result.status !== FINISHED_STATUS) {
    return { outcome: "not-finished", status: result.status };
  }

  return { outcome: "passed" };
}
