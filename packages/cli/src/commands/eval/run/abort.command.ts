import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";
import { PROMPT_EVAL_RUN_ABORT_CONTRACT } from "../../eval.contract.generated";

const RUN_ABORT_HELP = `
Examples:
  $ nexus eval run abort --run-id 77777777-7777-4777-8777-777777777777 --yes

Notes:
  CELLS ALREADY IN FLIGHT FINISH AND ARE KEPT. Cells that never started
  become SKIPPED, and the partial matrix keeps its scores and its cost —
  nothing already paid for is discarded.
  An aborted run stays ABORTED; the executor never overwrites it.
  Without --yes this asks at a terminal and REFUSES in a script.`;

/** `nexus eval run abort` */
export function registerEvalRunAbortCommand(run: Command, program: Command): Command {
  const runAbort = confirmable(
    run.command("abort").description("Stop a queued or running eval run")
  )
    .requiredOption("--run-id <id>", "Eval run id")
    .addHelpText("after", RUN_ABORT_HELP)
    .action(async (opts: { runId: string; yes?: boolean }) => {
      try {
        if (!(await confirmDestructive(`Abort eval run ${opts.runId}?`, opts))) return;
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptEvalRuns.abort(opts.runId);
        printEnvelope(result, () => {
          console.log(`Aborted ${result.id} (${result.abortReason ?? "USER_REQUESTED"})`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  bindCommand(runAbort, PROMPT_EVAL_RUN_ABORT_CONTRACT);
  return runAbort;
}
