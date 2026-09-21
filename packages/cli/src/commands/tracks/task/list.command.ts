import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope, printTable } from "../../../output";
import { TRACK_LIST_TASKS_CONTRACT } from "../../tracks.contract.generated";

const TASK_LIST_HELP = `
Examples:
  $ nexus tracks task list 11111111-1111-4111-8111-111111111111
  $ nexus tracks task list 11111111-1111-4111-8111-111111111111 --json

Notes:
  THIS IS NOT "nexus tracks task ready". That one answers what can be picked up
  right now and hides everything done, everything with children, and everything
  waiting on a blocker. This answers what the plan CONTAINS, so a task you
  finished is here and nowhere else — it is the only way to read or audit a
  board whole.
  IT IS NOT PAGED, and there is no --limit. The tree only means anything whole:
  parentTaskId has to resolve inside the answer, and position is unique per
  PARENT rather than per track, so a page would hand you a forest of orphans in
  an order you could not restore.
  ROWS ARE GROUPED BY PARENT, THEN BY position. Sorting the flat array by
  position alone interleaves the branches. Group by parentTaskId first.
  KIND SAYS WHAT THE ROW IS. STEP is work and is the only kind the rollup counts
  or the ready set offers; DECISION and DEFINITION are content recorded on the
  board. Everything is listed here, including the content — this is the board,
  not the burndown.
  READ banner FIRST ON EVERY ROW. It is the only place that says whether another
  agent is on a task, how long ago it was heard from, and the command to take it.
  A FOREIGN TRACK AND AN ABSENT ONE ARE BOTH REFUSED WITH 404, IDENTICALLY.
  You cannot tell them apart and that is deliberate: a different answer would
  tell you whether another organisation's track id exists.
  Needs the "track_tasks:read" scope.`;

/** `nexus tracks task list` */
export function registerTracksTaskListCommand(task: Command, program: Command): Command {
  const leaf = task
    .command("list")
    .description("The track's whole plan — every task, at every depth")
    .argument("<trackId>", "The track to read")
    .addHelpText("after", TASK_LIST_HELP)
    .action(async (trackId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listTasks(trackId);

        printEnvelope(result, () =>
          // 🔴 `DONE` IS A COLUMN RATHER THAN A FILTER, for the reason
          // `tracks list` gives about ARCHIVED: this read deliberately shows
          // finished work beside open work, and without the column the one view
          // that shows both cannot tell them apart. `KIND` is here for the same
          // reason one layer over — a DEFINITION and a STEP look identical by
          // title, and telling them apart is the whole point of the field.
          printTable(result.tasks, [
            { key: "title", label: "TITLE", width: 48 },
            { key: "kind", label: "KIND", width: 11 },
            { key: "gate", label: "GATE", width: 6 },
            { key: "doneAt", label: "DONE", width: 12 },
            { key: "position", label: "POS", width: 5 },
            { key: "parentTaskId", label: "PARENT", width: 38 },
            { key: "id", label: "ID", width: 38 }
          ])
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_LIST_TASKS_CONTRACT);
  return leaf;
}
