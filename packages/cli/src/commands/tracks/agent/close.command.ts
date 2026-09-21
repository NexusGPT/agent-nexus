import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import {
  TRACK_CLOSE_AGENT__BODY_STATE,
  TRACK_CLOSE_AGENT_CONTRACT
} from "../../tracks.contract.generated";

const AGENT_CLOSE_HELP = `
Examples:
  $ nexus tracks agent close 11111111-1111-4111-8111-111111111111 \\
      33333333-3333-4333-8333-333333333333 --state CLOSED
  $ nexus tracks agent close 11111111-1111-4111-8111-111111111111 \\
      33333333-3333-4333-8333-333333333333 --state DEAD \\
      --reason "sandbox ran out of disk twice, no output produced"

Notes:
  DEAD AND RETIRED DEMAND A REASON OF AT LEAST 15 CHARACTERS AFTER TRIMMING, and
  the reason is the whole content of those two states. A shorter one is a 400,
  not a stored row with an empty explanation. CLOSED is an ordinary completion
  and owes nothing.
  CLOSING FREES THE NAME. The uniqueness index covers OPEN agents only, so the
  name becomes available for a new agent the moment this returns.
  CLOSING DOES NOT RELEASE THE AGENT'S CLAIMS. The tasks it holds keep pointing
  at it, and the collision banner reads a claim held by a non-OPEN agent as
  nobody being on it.
  Needs the "track_agents:write" scope.`;

/** `nexus tracks agent close` */
export function registerTracksAgentCloseCommand(agent: Command, program: Command): Command {
  const leaf = agent
    .command("close")
    .description("Close, retire or kill an agent")
    .argument("<trackId>", "The track the agent belongs to")
    .argument("<agentId>", "The agent to close")
    .addOption(
      enumOption(
        "--state <state>",
        "How it ended",
        TRACK_CLOSE_AGENT__BODY_STATE
      ).makeOptionMandatory()
    )
    .option("--reason <text>", "At least 15 characters for DEAD and RETIRED")
    .addHelpText("after", AGENT_CLOSE_HELP)
    .action(async (trackId: string, agentId: string, opts: { state: string; reason?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const closed = await client.tracks.closeAgent(trackId, agentId, {
          state: opts.state as "CLOSED" | "DEAD" | "RETIRED",
          reason: opts.reason ?? null
        });

        printSuccess("Agent closed.", { id: closed.id, state: closed.state });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_CLOSE_AGENT_CONTRACT);
  return leaf;
}
