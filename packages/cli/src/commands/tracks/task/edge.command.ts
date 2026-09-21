import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { TRACK_CREATE_TASK_EDGE_CONTRACT } from "../../tracks.contract.generated";

const TASK_EDGE_HELP = `
Examples:
  $ nexus tracks task edge 11111111-1111-4111-8111-111111111111 \\
      --blocker 22222222-2222-4222-8222-222222222222 \\
      --blocked 55555555-5555-4555-8555-555555555555

Notes:
  AN EDGE THAT WOULD CLOSE A CIRCLE IS REFUSED WITH 409, and the refusal names
  the circle in traversal order.
  THE LOCK THIS TAKES IS PER TRACK, not organisation-wide. A task circle cannot
  leave its own track, so an organisation-scoped lock would serialise every
  planner in the organisation behind one another for nothing.
  BOTH ENDPOINTS MUST BE TASKS OF THE TRACK NAMED IN THE ARGUMENT. A task from
  another track is a 404, not a cross-track edge.
  A BLOCKER WITH CHILDREN IS SATISFIED BY ITS SUBTREE, NOT BY ITS OWN TICK. So a
  --blocker may name a section parent: it releases what it holds once every STEP
  leaf beneath it is done, which is exactly the set "nexus tracks rollup" counts.
  You do not have to tick the parent, and you may.
  EVERY OTHER BLOCKER IS RELEASED BY TICKING THAT ROW ITSELF — a task with no
  children of its own, and any DECISION or DEFINITION whatever hangs under it.
  Needs the "track_tasks:write" scope.`;

/** `nexus tracks task edge` */
export function registerTracksTaskEdgeCommand(task: Command, program: Command): Command {
  const leaf = task
    .command("edge")
    .description("Say that one task must finish before another may start")
    .argument("<trackId>", "The track both tasks belong to")
    .requiredOption("--blocker <taskId>", "The task that must finish first")
    .requiredOption("--blocked <taskId>", "The task that waits")
    .addHelpText("after", TASK_EDGE_HELP)
    .action(async (trackId: string, opts: { blocker: string; blocked: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const edge = await client.tracks.createTaskEdge(trackId, {
          blockerTaskId: opts.blocker,
          blockedTaskId: opts.blocked
        });

        printSuccess("Task dependency added.", { id: edge.id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_CREATE_TASK_EDGE_CONTRACT);
  return leaf;
}
