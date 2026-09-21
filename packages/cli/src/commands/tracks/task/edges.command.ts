import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope, printTable } from "../../../output";
import { TRACK_LIST_TASK_EDGES_CONTRACT } from "../../tracks.contract.generated";

const TASK_EDGES_HELP = `
Examples:
  $ nexus tracks task edges 11111111-1111-4111-8111-111111111111
  $ nexus tracks task edges 11111111-1111-4111-8111-111111111111 --json

Notes:
  "edges" READS AND "edge" WRITES. This one takes the track and nothing else;
  "nexus tracks task edge" adds one and requires --blocker and --blocked. A
  mistyped read lists; a mistyped write refuses on the missing options.
  THIS IS WHAT ACCOUNTS FOR A TASK "nexus tracks task ready" WITHHOLDS. Ready
  answers what can be picked up NOW; "task list" answers what the plan contains.
  The difference between the two is the set nothing else could explain — and a
  task's blockers are the edges naming IT OR ANY OF ITS ANCESTORS as
  blockedTaskId. An edge hung on a section parent holds every row beneath it and
  those rows carry no edge of their own, so reading only the edges that name a
  task directly reports a genuinely blocked row as unexplained.
  "nexus tracks task why-not-ready" composes that walk for you.
  IT IS UNORDERED. The row carries no position and the table has no ordering
  column, so no order is promised and none should be relied on.
  IT CARRIES NO CYCLE INFORMATION. Refusing a circle is the write path's job,
  inside a lock over a snapshot this read does not have.
  A FOREIGN TRACK AND AN ABSENT ONE ARE BOTH REFUSED WITH 404, IDENTICALLY.
  You cannot tell them apart and that is deliberate: a different answer would
  tell you whether another organisation's track id exists.
  Needs the "track_tasks:read" scope.`;

/** `nexus tracks task edges` */
export function registerTracksTaskEdgesCommand(task: Command, program: Command): Command {
  const leaf = task
    .command("edges")
    .description("What blocks what, inside this track's plan")
    .argument("<trackId>", "The track whose plan to read")
    .addHelpText("after", TASK_EDGES_HELP)
    .action(async (trackId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listTaskEdges(trackId);

        printEnvelope(result, () =>
          printTable(result.edges, [
            { key: "blockerTaskId", label: "BLOCKER (finishes first)", width: 38 },
            { key: "blockedTaskId", label: "BLOCKED (waits)", width: 38 },
            { key: "id", label: "ID", width: 38 }
          ])
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_LIST_TASK_EDGES_CONTRACT);
  return leaf;
}
