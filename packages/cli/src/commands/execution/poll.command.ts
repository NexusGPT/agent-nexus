import { Command } from "commander";

import { bindCommand } from "../../contract-binding";
import { WORKFLOW_EXECUTION_POLL_CONTRACT } from "../execution.contract.generated";
import { EXECUTION_POLL_HELP } from "./copy/poll-help";
import { runPoll } from "./poll.handler";

/** `nexus execution poll` — one read, or watch until terminal. */
export function registerExecutionPollCommand(execution: Command, program: Command): void {
  const poll = execution
    .command("poll")
    .description("Poll execution status and output data")
    // debt: this leaf carries `exit-carries-resource-state` — the same property that
    //       got `execution diagnose` a row in `id-graph.leaf-residue.ts` — and NOTHING
    //       declares it. `judgeRunStatus` -> `reportRunRefusal` returns `remote-error`
    //       for FAILED and `unmeasured` for CANCELLED / PENDING / RUNNING, neither of
    //       them the `invalid-input` category, so all four non-COMPLETED statuses map
    //       to FAILED; under --json the record is not even printed.
    //
    //       Ceiling: the leaf stays out of the id-graph population for ONE reason, and
    //       it is this line. `[id]` is optional (because `--token` is the other half of
    //       an OR), `walkLeaves` builds `requiredParams` by filtering on
    //       `argument.required`, and `deriveIdGraph` only considers leaves with
    //       `requiredParams.length > 0`. The binding is not what saves it: `poll` IS
    //       bound, to a GET contract, at the foot of this file.
    //
    //       Upgrade trigger: someone makes this positional required — `<id>` — for any
    //       reason at all, splitting the `--token` branch into its own leaf being the
    //       likely one. It then enters the swept population and reds `CLI: Sweep`, a
    //       REQUIRED context, on whichever execution staging's list returns first.
    //
    //       Do that and the fix is a `LEAF_RESIDUE` row, `exit-carries-resource-state`,
    //       in the same commit. NOT before: measured 2026-09-10, adding that row today
    //       fails `id-graph.test.ts` with `execution poll: declared unsweepable and not
    //       excluded`, because the test requires every declared row to be a leaf the
    //       graph actually EXCLUDED, and this one is in neither list.
    .argument("[id]", "Execution ID")
    .option("--token <token>", "Poll by polling token instead of execution ID")
    .option("--watch", "Poll repeatedly until execution reaches a terminal status")
    // Commander renders the default itself, so spelling it in the description
    // printed "(default: 2000) (default: "2000")".
    .option("--interval <ms>", "Polling interval in milliseconds (floor 500)", "2000")
    .addHelpText("after", EXECUTION_POLL_HELP)
    .action(async (id: string | undefined, opts) => {
      await runPoll(program, id, opts);
    });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  // `--token` switches this leaf to `WorkflowExecutionPollByToken`, which takes a
  // polling token where this takes an execution id and is otherwise the same
  // read. One leaf, two descriptors, one shape — the default branch binds.
  bindCommand(poll, WORKFLOW_EXECUTION_POLL_CONTRACT);
}
