import { CLI_NODE_TEST_NOT_MEASURED, printFailure, reportFailure } from "./errors";
import { EXIT_CODES } from "./exit-codes";
import type { FailedNodeTestVerdict } from "./node-test-verdict.types";

/**
 * RENDERING a failed verdict, which is a different job from REACHING one.
 *
 * `node-test-verdict.ts` decides; this prints the refusal that decision means
 * and hands back the exit code it carries. Keeping the two apart is why the
 * judge imports nothing from `./errors` or `./exit-codes` and stays reachable
 * from a spec with no console in the way.
 */

/**
 * PRINT the refusal a failed verdict means and RETURN its exit code.
 *
 * ⚠️ THE RETURN VALUE IS THE WHOLE POINT — assign it. `reportFailure` and
 * `printFailure` only write the document; a bare call here emits a perfect error
 * and exits `0`, which is the class this change is draining.
 *
 * Takes {@link FailedNodeTestVerdict} rather than
 * {@link import("./node-test-verdict.types").NodeTestVerdict} so a caller that
 * forgets to branch gets a type error instead of a refusal describing a
 * success — the same construction `refusalForProbe` uses.
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
