import type { TestNodeResult } from "@agent-nexus/sdk";

import { CLI_NODE_TEST_NOT_MEASURED, printFailure, reportFailure } from "./errors";
import { EXIT_CODES } from "./exit-codes";

/**
 * THE ONE PLACE THIS CLI DECIDES WHETHER A SINGLE-NODE TEST PASSED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `status` READS `"COMPLETED"` FOR A RUN WHOSE NODE FAILED. THE FIELD THIS
 *    COMMAND PRINTS IS ALREADY THE WRONG VERDICT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `workflow test-node` and `workflow node test` are TWO SPELLINGS OF ONE
 * OPERATION — the same SDK method, the same endpoint, the same response — and
 * both printed `TestNodeResult` and exited `0` whatever it said. That is a double
 * false green, and the exit code is the cheaper half:
 *
 *   · `status` is the RUN's status, not the node's. `WorkflowNodeTestingService`
 *     catches the executor's throw, stores the node as `SKIPPED`, and RETURNS
 *     normally with `{ data: { error, errorDetails, timestamp } }` and no status
 *     at all — so the v1 layer's `result.status ?? "COMPLETED"` stamps
 *     `"COMPLETED"` on a failure. Mapping `status` to an exit code AS IT STANDS
 *     would ship a gate that says PASS on a broken node;
 *   · the outcome that matters is inside `data`, and the console reads it exactly
 *     the way this module does — `runOutput?.error || runOutput?.errorDetails`
 *     is the frontend's own test panel condition
 *     (`Nodes/Main/InternalTools/CustomScriptNode/TestSection.tsx`). One rule,
 *     two surfaces, so the CLI cannot disagree with the screen about whether the
 *     same node test failed.
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
 * So the union below has three arms and they map to three different exits:
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
 */

/**
 * What a single-node test actually reports. A CLOSED union, so a caller cannot
 * handle the good arm and let both failures fall through a default — the shape
 * that produced the defect this module exists to close.
 */
export type NodeTestVerdict =
  /** The node ran and reported no error. The only arm that exits `0`. */
  | { readonly outcome: "passed" }
  /**
   * The node ran and FAILED. `message` is the executor's own message, read from
   * `data.error` or `data.errorDetails.message`; neither is guaranteed by the
   * SDK's type, so it falls back to a sentence rather than to `undefined`.
   */
  | { readonly outcome: "node-failed"; readonly message: string }
  /**
   * The test was dispatched to the background. `data` is `null` and there is no
   * outcome to judge. `status` is carried so the refusal can name what the
   * response actually said rather than asserting `"PENDING"`.
   */
  | { readonly outcome: "not-finished"; readonly status: string };

/** Every arm that is not a pass, so a caller that forgets to branch is a type error. */
export type FailedNodeTestVerdict = Exclude<NodeTestVerdict, { outcome: "passed" }>;

/** The run status the platform stamps on a test that produced an answer inline. */
const FINISHED_STATUS = "COMPLETED";

/**
 * The error payload a failed node test returns, as the two keys that identify it.
 *
 * Read as `unknown` and narrowed here rather than typed on `TestNodeResult.data`,
 * which the SDK declares `unknown` because the success arm is whatever the node
 * produced. A cast would claim a shape nobody verified.
 *
 * ⚠️ TRUTHY, NEVER "THE KEY IS PRESENT". The console's condition is
 * `runOutput?.error || runOutput?.errorDetails`, and the whole justification for
 * this module is that one rule serves both surfaces. A presence test diverges on
 * every falsy value a node can legitimately emit — `{ error: null }` is a common
 * success envelope, and `false`, `0` and `""` are all real outputs — so the
 * screen would read PASS while the CLI exited non-zero for the same run. Neither
 * key alone is safe to demand either: `error` is `errorData.message`, which
 * `toNodeTestErrorData` declares OPTIONAL, and `errorDetails` is the object it
 * always writes beside it.
 */
function errorMessageIn(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as { error?: unknown; errorDetails?: unknown };

  if (!record.error && !record.errorDetails) return null;

  if (typeof record.error === "string" && record.error !== "") return record.error;

  const details = record.errorDetails;
  if (typeof details === "object" && details !== null) {
    const message = (details as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
  }

  // A failure whose message did not survive is still a failure. Returning `null`
  // here would report the node as PASSED because its error text was malformed,
  // which is the false green in its purest form.
  return "the node reported an error with no message";
}

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

/**
 * PRINT the refusal a failed verdict means and RETURN its exit code.
 *
 * ⚠️ THE RETURN VALUE IS THE WHOLE POINT — assign it. `reportFailure` and
 * `printFailure` only write the document; a bare call here emits a perfect error
 * and exits `0`, which is the class this change is draining.
 *
 * Takes {@link FailedNodeTestVerdict} rather than {@link NodeTestVerdict} so a
 * caller that forgets to branch gets a type error instead of a refusal
 * describing a success — the same construction `refusalForProbe` uses.
 */
export function reportNodeTestRefusal(verdict: FailedNodeTestVerdict): number {
  if (verdict.outcome === "node-failed") {
    // `remote-error`, never a refusal of the command line: the invocation was
    // ACCEPTED and the platform answered that the node under test does not work.
    // The caller's next move is to fix the node. Same taxonomy choice as
    // `external-tool test-auth`, for the same reason.
    return reportFailure(
      "remote-error",
      `Node test failed: ${verdict.message}`,
      "Fix the node's configuration or its inputs, then test it again. Under --json " +
        "this document REPLACES the result — re-run without it to read `data.errorDetails`."
    );
  }

  printFailure(
    `The node test reported "${verdict.status}" — it was dispatched to the background, so its outcome is NOT in this response.`,
    CLI_NODE_TEST_NOT_MEASURED,
    "Nothing failed and nothing passed. This node type runs asynchronously, so `data` " +
      "is null and no verdict was measured — the exit code is UNMEASURED, never a failure."
  );
  return EXIT_CODES.unmeasured;
}
