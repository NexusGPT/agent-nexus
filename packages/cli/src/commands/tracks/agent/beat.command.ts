import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { TRACK_BEAT_AGENT_CONTRACT } from "../../tracks.contract.generated";

const AGENT_BEAT_HELP = `
Examples:
  $ nexus tracks agent beat 11111111-1111-4111-8111-111111111111 \\
      33333333-3333-4333-8333-333333333333

Notes:
  THIS WRITES lastHeardAt AND NOTHING ELSE. It is the one last-heard clock in
  this domain, and every collision banner's staleness is derived from it. No
  sweep reads it — nothing closes an agent for going quiet.
  AN AGENT THAT STOPS BEATING IS NOT CLOSED. Its claims stay on their tasks and
  its row stays OPEN — what changes is that the banner starts telling the next
  reader how long ago it was last heard from, and they decide.
  A CLOSED, DEAD OR RETIRED AGENT IS A 409 HERE, and an id you cannot see is a
  404. Beating a terminal agent does not reopen it, and the refusal is the point:
  refreshing the clock would make the banner report a finished agent as live.
  Needs the "track_agents:write" scope.`;

/** `nexus tracks agent beat` */
export function registerTracksAgentBeatCommand(agent: Command, program: Command): Command {
  const leaf = agent
    .command("beat")
    .description("The heartbeat — record that this agent is still alive")
    .argument("<trackId>", "The track the agent belongs to")
    .argument("<agentId>", "The agent whose heartbeat this is")
    .addHelpText("after", AGENT_BEAT_HELP)
    .action(async (trackId: string, agentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const beaten = await client.tracks.beatAgent(trackId, agentId);

        printSuccess("Heartbeat recorded.", { id: beaten.id, lastHeardAt: beaten.lastHeardAt });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_BEAT_AGENT_CONTRACT);
  return leaf;
}
