import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { TRACK_CLAIM_TASK_CONTRACT } from "../../tracks.contract.generated";

const TASK_CLAIM_HELP = `
Examples:
  $ nexus tracks task claim 22222222-2222-4222-8222-222222222222 \\
      --agent 33333333-3333-4333-8333-333333333333

  $ nexus tracks task claim 22222222-2222-4222-8222-222222222222 \\
      --agent backend-lane

Notes:
  A CLAIM TAKES NO LOCK AND NEVER REFUSES BECAUSE SOMEBODY ELSE HOLDS THE TASK.
  It succeeds and overwrites — claiming and taking over are the same operation,
  which is why there is no separate take-over command. It still answers 404 for
  a task you cannot reach and 409 when that agent is not OPEN on this task's
  track. The next agent to read the task is told who holds it and how long ago
  that agent was last heard from, and decides for itself.
  --agent TAKES AN ID OR A NAME. A name is unique among a track's OPEN agents,
  so the value the banner prints for the HOLDER is a value you can pass. Closing
  an agent frees its name, which is why the uniqueness is only over OPEN ones.
  AN ID WINS WHEN A VALUE COULD BE EITHER. Agent names are unconstrained, so an
  agent may legitimately be NAMED after a uuid — such an agent is claimable by
  its own id and not by that name. The response always carries the resolved id,
  never the spelling you sent.
  ONE REFUSAL, NOT TWO: an unknown name, a name whose agent has been closed, and
  an agent on another track all answer the same 409. It never tells you whether
  a name exists on a track, which is what would let it be probed.
  WHERE AN ID COMES FROM: "nexus tracks agent open" opens an agent on a track
  and prints its id, and "nexus tracks agent list" shows the ones already OPEN
  there. Claiming neither creates an agent nor falls back to an implicit one, so
  a caller holding neither an id nor a name opens one first.
  THE BANNER ON EVERY TASK READ NAMES THIS COMMAND, and that string is
  generated from this registration. It is not a copy you may edit.
  Needs the "track_tasks:write" scope.`;

/**
 * ## Why `task claim` is special
 *
 * 🔴 THIS REGISTRATION IS THE SOURCE OF A GENERATED STRING, NOT JUST A COMMAND.
 * The collision banner every task read carries names a runnable command, and
 * that string is READ OFF THIS NODE by
 * `packages/cli/scripts/generate-track-banner-commands.ts` — the words come from
 * the parent chain, the placeholders from the argument and option declared here.
 * Nothing about the banner is typed by a person.
 *
 * So renaming `claim`, moving it under a different parent, or dropping `--agent`
 * BREAKS THE BUILD: the generator exits non-zero naming the action and
 * `track-banner-commands-name-a-real-command.test.ts` reds. That is the whole
 * mechanism — a banner naming a command the CLI does not register is an
 * instruction that fails in the reader's hands.
 *
 * ⚠️ `--agent` TAKES AN ID **OR** A NAME, AND ITS PLACEHOLDER STILL READS
 * `<agentId>` ON PURPOSE. The route resolves either — the name is unique among a
 * track's OPEN agents, and it is the value the banner's own "another agent is
 * working on this" line prints — so pasting a name out of the banner now works.
 * The placeholder is deliberately NOT renamed: it is read off this node into
 * `packages/types/src/shared/domain/tracks/track-banner-commands.generated.ts`
 * and printed inside every banner, and a rename would regenerate that plus three
 * other generated artefacts and red
 * `tracks-claim-help-names-the-agent-verb.test.ts`'s control — for a flag whose
 * ACCEPTED set widened while its wire field name did not move. What accepts more
 * needs no new spelling; the flag's DESCRIPTION and the notes below say so.
 *
 * ## There is no separate take-over verb, deliberately
 *
 * A claim on a task another agent already holds SUCCEEDS and overwrites.
 * `claimedByAgentId` is coordination, not access control — one credential per
 * organisation, no per-agent identity — so a refusal would enforce nothing and
 * would have to be recovered from. Claiming and taking over are one operation,
 * which is why both banner forms name this one command.
 */
export function registerTracksTaskClaimCommand(task: Command, program: Command): Command {
  const leaf = task
    .command("claim")
    .description("Say you are working on a task, taking it over if somebody already was")
    .argument("<taskId>", "The task to claim")
    .requiredOption("--agent <agentId>", "The OPEN agent claiming it — its name or its id")
    .addHelpText("after", TASK_CLAIM_HELP)
    .action(async (taskId: string, opts: { agent: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const claimed = await client.tracks.claimTask(taskId, { agentId: opts.agent });

        printSuccess("Task claimed.", claimed);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_CLAIM_TASK_CONTRACT);
  return leaf;
}
