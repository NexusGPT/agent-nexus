import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { color, printEnvelope, printTable } from "../../../output";
import { TRACK_LIST_READY_TASKS_CONTRACT } from "../../tracks.contract.generated";
import { renderReadyTaskFooters } from "./ready.render";

const TASK_READY_HELP = `
Examples:
  $ nexus tracks task ready 11111111-1111-4111-8111-111111111111
  $ nexus tracks task ready 11111111-1111-4111-8111-111111111111 --limit 5

Notes:
  A FOREIGN TRACK AND AN ABSENT ONE ARE BOTH REFUSED WITH 404, IDENTICALLY.
  You cannot tell them apart and that is deliberate: a different answer would
  tell you whether another organisation's track id exists.
  gate: true MEANS THE TASK WILL REFUSE ITS OWN COMPLETION WITHOUT EVIDENCE.
  It travels with the row so you know before you start, not at the moment you
  tick the box.
  ONLY STEP TASKS ARE EVER IN THIS SET. A DECISION or a DEFINITION is content
  recorded on the board, so it can never be picked up and is not offered here.
  It can still BLOCK: an unticked content row somebody drew an edge from holds
  its dependents exactly as a step would, because dropping it would release work
  rather than merely show less. Run "nexus tracks task list" to see everything.
  A TASK WAITING ON A SECTION PARENT APPEARS HERE ONCE THAT PARENT'S SUBTREE IS
  DONE. Nobody has to tick the parent: a blocker with children is satisfied by
  every STEP leaf beneath it being done, the same set the rollup counts.
  IT ANSWERS TWO QUESTIONS AND PRINTS TWO TABLES. The first is what you can pick
  up: unblocked AND nextOwner CUE. The second, printed only when it has rows, is
  what is unblocked and waiting on somebody else — USER means a person has to act,
  EVENT means something outside has to happen first.
  COUNT THE FIRST TABLE, NEVER THE TWO TOGETHER. That sum is "how much is
  unblocked", which is a different question and the one that used to be reported
  as readiness: one board read 29 ready when 6 were workable.
  A WAITING ROW IS NOT BLOCKED. Every blocker on it is satisfied. It is absent
  from the first table because it is not your turn, not because anything is
  holding it, so "nexus tracks task why-not-ready" will not explain it and should
  not — it answers the blocker axis, and this is the owner axis.
  nextOwner IS SET AT PLAN IMPORT AND NOWHERE ELSE, because that is the only door
  a task row is born through. A plan whose entries name no owner imports every row
  as CUE, which is what every row meant before the field existed.
  A TASK ANOTHER AGENT HOLDS IS STILL IN THIS LIST, and the rows do not say so.
  The query tests done, leaf and blocker state and never reads the claim, so
  READY means unblocked rather than unattended. Read the task itself with
  "nexus tracks task get <taskId>" — its banner is the only place that
  instruction lives.
  THIS LIST AND THAT BANNER ANSWER DIFFERENT QUESTIONS AND CANNOT CONTRADICT
  EACH OTHER. This is the blocker axis; the banner is the claim axis, rendered
  from the holding agent alone. A task absent here whose banner says nobody is
  on it is blocked and unheld, which is both answers being right.
  --limit DEFAULTS TO 50 SERVER SIDE, so this list is truncated whether or not
  you passed the flag and absence from it is not proof a task is blocked. This
  response carries hasMore, and the footer under the table says so when the page
  was cut. Widen --limit, up to 200, and re-read before reading a missing row as
  blocked. There is deliberately no total and no cursor.
  Needs the "track_tasks:read" scope.`;

/** `nexus tracks task ready` */
export function registerTracksTaskReadyCommand(task: Command, program: Command): Command {
  const leaf = task
    .command("ready")
    .description("The tasks in one track that can be picked up right now")
    .argument("<trackId>", "The track to read")
    .option("--limit <n>", "How many rows, 1-200", (value: string) => Number(value))
    .addHelpText("after", TASK_READY_HELP)
    .action(async (trackId: string, opts: { limit?: number }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listReadyTasks(trackId, { limit: opts.limit });

        printEnvelope(result, () => {
          // 🔴 TWO TABLES, NEVER ONE WITH A COLUMN, AND THAT IS THE WHOLE POINT
          // OF THE ROUTE'S NEW SHAPE. The wire already refuses to hand a caller
          // one summable array; rendering both halves back into a single table
          // with a `WAITING ON` column would put the defect back on the surface a
          // person actually reads — 29 rows under one heading, six of them
          // workable. `tracks ready` one grain up DOES use that column, and it is
          // right there: it is a navigation read, and nothing picks work off it.
          printTable(result.workable, [
            { key: "title", label: "TITLE", width: 52 },
            { key: "gate", label: "GATE", width: 6 },
            { key: "acceptance", label: "ACCEPTANCE", width: 52 },
            { key: "id", label: "ID", width: 38 }
          ]);

          // 🔴 PRINTED ONLY WHEN IT HAS ROWS, AND NEVER AS AN EMPTY TABLE. On a
          // board with no owner decisions at all — which is every board that has
          // not been curated, so most of them — a permanent empty second section
          // is a heading that teaches the reader to skip the region. On the day it
          // carries rows, it does not get read.
          if (result.waiting.length > 0) {
            console.log(
              color.dim(
                `\nWAITING ON SOMEBODY ELSE — unblocked, but not yours to pick up.\n` +
                  `Move one to you with a plan that names its owner, or settle it and tick it.`
              )
            );
            printTable(result.waiting, [
              { key: "title", label: "TITLE", width: 52 },
              { key: "nextOwner", label: "WAITING ON", width: 12 },
              { key: "acceptance", label: "ACCEPTANCE", width: 52 },
              { key: "id", label: "ID", width: 38 }
            ]);
          }

          renderReadyTaskFooters(result, trackId);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_LIST_READY_TASKS_CONTRACT);
  return leaf;
}
