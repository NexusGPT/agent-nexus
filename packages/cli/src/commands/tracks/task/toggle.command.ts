import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { booleanFlag } from "../../../util/boolean-flag";
import { TRACK_TOGGLE_TASK_CONTRACT } from "../../tracks.contract.generated";

const TASK_TOGGLE_HELP = `
Examples:
  $ nexus tracks task toggle 22222222-2222-4222-8222-222222222222 --done true
  $ nexus tracks task toggle 22222222-2222-4222-8222-222222222222 --done true \\
      --evidence "suite green at 154 files, log attached"
  $ nexus tracks task toggle 22222222-2222-4222-8222-222222222222 --done false

Notes:
  A GATE REFUSES ITS OWN COMPLETION WITHOUT EVIDENCE, AND SO DOES EVERYTHING
  ABOVE ONE. Ticking a parent whose subtree holds an unevidenced gate is
  refused with 422, and the refusal names up to five of the blocking gates — a
  reader who sees five knows the shape of the problem and the sixth adds
  nothing.
  AN UN-TICK ERASES THE EVIDENCE, AND IT DOES NOT ASK FIRST. Setting done to
  false clears doneAt, doneByUserId and evidence in one statement — the three go
  to NULL together, because the database refuses evidence on an unticked task —
  so a re-tick has to supply its proof again. --evidence itself is ignored here.
  THIS DOES NOT CLAIM THE TASK. Ticking a task somebody else holds succeeds —
  the claim is coordination, never a lock.
  Needs the "track_tasks:write" scope.`;

/** `nexus tracks task toggle` */
export function registerTracksTaskToggleCommand(task: Command, program: Command): Command {
  const leaf = task
    .command("toggle")
    .description("Tick or un-tick one task")
    .argument("<taskId>", "The task to tick or un-tick")
    .requiredOption("--done <bool>", "true ticks it, false un-ticks it", booleanFlag)
    .option("--evidence <text>", "Required when the task is a gate. Ignored on an un-tick")
    .addHelpText("after", TASK_TOGGLE_HELP)
    .action(async (taskId: string, opts: { done: boolean; evidence?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.toggleTask(taskId, {
          done: opts.done,
          evidence: opts.evidence ?? null
        });

        printSuccess(result.done ? "Task ticked." : "Task un-ticked.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_TOGGLE_TASK_CONTRACT);
  return leaf;
}
