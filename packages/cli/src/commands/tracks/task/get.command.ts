import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printRecord } from "../../../output";
import { TRACK_READ_TASK_CONTRACT } from "../../tracks.contract.generated";

const TASK_GET_HELP = `
Examples:
  $ nexus tracks task get 22222222-2222-4222-8222-222222222222
  $ nexus tracks task get 22222222-2222-4222-8222-222222222222 --json

Notes:
  READ banner FIRST. It is the first field on the wire on purpose: nothing in
  this domain reserves a region of a track or refuses a second worker, so
  collision avoidance is a live instruction that arrives with the thing you
  asked for. It names the exact command to run to take the task.
  nextOwner IS WHOSE TURN IT IS, AND IT IS A THIRD AXIS. CUE means an agent can
  proceed, USER that a person has to act, EVENT that something outside has to
  happen first. It is not the banner (who is on it right now), not doneByUserId
  (who ticked it), and not a permission — it grants and refuses nothing.
  A ROW CAN BE USER AND UNCLAIMED, OR CUE AND HELD. The two say nothing about each
  other, so read both.
  THE BANNER REPORTS WHO IS ON THE TASK, NEVER WHETHER IT CAN BE STARTED. It is
  rendered from the holding agent and a clock, and reads nothing about blockers
  or done state, so "nobody is on this" is not a claim that the task is
  unblocked. Run "nexus tracks task ready <trackId>" for that axis.
  A CLAIM HELD BY AN AGENT THAT IS NO LONGER OPEN READS AS NOBODY ON IT. A
  closed agent and an absent claim mean the same thing and render the same
  banner, so claimedByAgentId can be set while the banner says
  "NOBODY IS ON THIS".
  THE AGE IN THE BANNER COMES FROM THE HEARTBEAT AND FROM NOTHING ELSE. "last
  heard 40s ago" and "last heard 4h ago" are the whole judgement; a holder named
  without an age would read as authority while often describing a dead agent.
  Needs the "track_tasks:read" scope.`;

/** `nexus tracks task get` */
export function registerTracksTaskGetCommand(task: Command, program: Command): Command {
  const leaf = task
    .command("get")
    .description("One task, with its collision banner")
    .argument("<taskId>", "The task to read")
    .addHelpText("after", TASK_GET_HELP)
    .action(async (taskId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const found = await client.tracks.readTask(taskId);

        printRecord(found);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_READ_TASK_CONTRACT);
  return leaf;
}
