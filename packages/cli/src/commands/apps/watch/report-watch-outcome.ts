import { EXIT_CODES } from "../../../exit-codes";
import { isJsonMode } from "../../../output";
import { printApprovalRefused } from "./print-approval-refused";
import { printDeployTimeout } from "./print-deploy-timeout";
import { printDisplaced } from "./print-displaced";
import { printEdgeUnconfirmed } from "./print-edge-unconfirmed";
import { printFailed } from "./print-failed";
import { printServed } from "./print-served";
import { printSuperseded } from "./print-superseded";
import type { WatchOutcome } from "./watch-outcome";

/**
 * Render the outcome and return the process exit code. Success is `0` and
 * nothing else is: a caller scripting `nexus apps deploy --watch` must be able
 * to branch on the exit code alone.
 *
 * ⚠️ THE NUMBERS COME FROM `src/exit-codes.ts` AND THE CATEGORIES ARE
 * DELIBERATELY UNCHANGED. This was once a fifth exit map — bare `0` and `1`
 * literals — and binding it to the taxonomy removes the map without touching
 * what any outcome MEANS. Several of these are arguably `outcome-not-reached`
 * or `unmeasured` rather than `failed`; that is a real re-categorization of a
 * scripting surface whose whole contract is the exit code, so it is a separate
 * deliberate decision and not a side effect of declaring the numbers.
 *
 * 🚨 THE SHAPE OF THIS FUNCTION IS READ BY A GATE, NOT JUST BY PEOPLE.
 * `src/exit-code-taxonomy.test.ts` resolves the exit-producing closure by
 * matching `function reportWatchOutcome(` and requires exactly ONE definition
 * of that name in the package, so this must stay a `function` DECLARATION with
 * a unique name — an arrow assigned to a `const`, or a re-export shim that
 * redeclares it, is red. It also refuses a bare integer verdict
 * (`return 1;`, `return x ? 0 : 1;`), which is why every arm below names an
 * `EXIT_CODES` member. The per-outcome printers are void on purpose: a printer
 * that returned a code would join that closure and inherit all of it.
 */
export function reportWatchOutcome(outcome: WatchOutcome, appId: string): number {
  if (isJsonMode()) {
    // The ONLY document a watched run writes to stdout — the trigger printer is
    // suppressed upstream when a watch follows, because two documents on one
    // stream is not parseable by `jq` and the whole point of --json is that it
    // is. `kind` is dropped in favour of `outcome`, rather than appearing twice.
    const { kind, ...rest } = outcome;
    console.log(JSON.stringify({ outcome: kind, ...rest }, null, 2));
    return kind === "served" ? EXIT_CODES.success : EXIT_CODES.failed;
  }

  switch (outcome.kind) {
    case "served":
      printServed(outcome, appId);
      return EXIT_CODES.success;

    case "failed":
      printFailed(outcome, appId);
      return EXIT_CODES.failed;

    case "superseded":
      printSuperseded(outcome);
      return EXIT_CODES.failed;

    case "displaced":
      printDisplaced(outcome);
      return EXIT_CODES.failed;

    case "approval-refused":
      printApprovalRefused(outcome);
      return EXIT_CODES.failed;

    case "deploy-timeout":
      printDeployTimeout(outcome, appId);
      return EXIT_CODES.failed;

    case "edge-unconfirmed":
      printEdgeUnconfirmed(outcome);
      return EXIT_CODES.failed;
  }
}
