import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { color, isJsonMode } from "../../output";
import { runFollow, shortTag } from "../../util/run-follow";

// ONE LEAF IS DELIBERATELY UNBOUND:
//
//   · `follow` — it COMPOSES two descriptors rather than choosing between
//     them: one `WorkflowExecutionGet` for the workflow-id label, then
//     `WorkflowExecutionDiagnose` in a loop inside `util/run-follow.ts`.
//     `bindCommand` takes one shape, so either choice would print a contract
//     block describing half of what the command does. That is not the `poll`
//     case below, where `--token` picks ONE of two interchangeable routes.

/** `nexus execution follow` — stream a run's nodes as they finish. */
export function registerExecutionFollowCommand(execution: Command, program: Command): void {
  execution
    .command("follow")
    .description("Follow a running execution, printing per-node progress as it happens")
    .argument("<id>", "Execution ID")
    // See `poll`: the default is rendered by commander.
    .option("--interval <ms>", "Polling interval in milliseconds (floor 500)", "1500")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus execution follow 11111111-1111-4111-8111-111111111111
  $ nexus execution follow 11111111-1111-4111-8111-111111111111 --interval 3000
  $ nexus execution follow 11111111-1111-4111-8111-111111111111 --json   # NDJSON of per-node state changes

Notes:
  Prints each node as its state changes and exits at a terminal status, so it is
  the read to attach to a run you have just started. "workflow test --follow" does
  the same thing in one command.
  --json emits one NDJSON object per state change, not a single document — read it
  line by line.
  Polling, not streaming: --interval (floored at 500 ms) decides how fast changes
  appear, and a node that starts and finishes inside one interval is reported once.
  LOOP ITERATIONS ARE FLATTENED INTO THE SAME STREAM, one line per node per pass,
  labelled "<loop name> iter <n>: <node name>". THE PRINTED ITERATION IS
  ZERO-BASED while the diagnose payload's own iteration number starts at 1, so
  "iter 0" and iteration 1 are the same pass — do not read the two as a run that
  skipped one.
  A line identifies its node by that path label, never by node id. To act on a
  node — "execution node-result", "workflow node get" — take the id from
  "execution diagnose" instead.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const interval = Math.max(500, parseInt(opts.interval, 10) || 1500);

        // Best-effort: derive the workflow id for the [wf …] prefix.
        let wfTag = shortTag(id);
        try {
          const exec = await client.workflowExecutions.get(id);
          if (exec?.workflowId) wfTag = shortTag(exec.workflowId);
        } catch {
          // fall back to the execution short id
        }

        const finalStatus = await runFollow(client, id, {
          interval,
          wfTag,
          json: isJsonMode()
        });

        if (!isJsonMode()) {
          const paint =
            finalStatus === "COMPLETED"
              ? color.green
              : finalStatus === "FAILED" || finalStatus === "ERROR" || finalStatus === "CANCELLED"
                ? color.red
                : color.yellow;
          console.log(`\n${color.dim("Final status:")} ${paint(finalStatus)}`);
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
