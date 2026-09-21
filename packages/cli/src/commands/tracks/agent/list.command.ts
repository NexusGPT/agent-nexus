import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope, printTable } from "../../../output";
import {
  TRACK_LIST_AGENTS__PARAMS_STATE,
  TRACK_LIST_AGENTS_CONTRACT
} from "../../tracks.contract.generated";

const AGENT_LIST_HELP = `
Examples:
  $ nexus tracks agent list 11111111-1111-4111-8111-111111111111
  $ nexus tracks agent list 11111111-1111-4111-8111-111111111111 --state OPEN

Notes:
  AN AGENT HERE IS A RECORD OF A CONTRACT, NEVER A RUNNING PROCESS. Nothing in
  this domain starts an agent, spawns a sandbox or calls a model, and an OPEN
  row does not mean anything is executing right now.
  lastHeardAt IS THE ONLY LIVENESS SIGNAL. Opening an agent sets it to that
  instant, and after that only "nexus tracks agent beat" moves it. An OPEN agent
  that has not beaten in hours is what a dead worker looks like.
  THE NAME IS UNIQUE AMONG OPEN AGENTS ONLY. Closing an agent frees its name for
  reuse, so two rows in this list can share a name when one of them is terminal.
  Needs the "track_agents:read" scope.`;

/** `nexus tracks agent list` */
export function registerTracksAgentListCommand(agent: Command, program: Command): Command {
  const leaf = agent
    .command("list")
    .description("The agents on this track, most recently heard from first")
    .argument("<trackId>", "The track to read")
    .addOption(
      enumOption("--state <state>", "Only agents in this state", TRACK_LIST_AGENTS__PARAMS_STATE)
    )
    .addHelpText("after", AGENT_LIST_HELP)
    .action(async (trackId: string, opts: { state?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listAgents(trackId, {
          state: opts.state as never
        });

        printEnvelope(result, () =>
          printTable(result.agents, [
            { key: "name", label: "NAME", width: 28 },
            { key: "state", label: "STATE", width: 9 },
            { key: "lastHeardAt", label: "LAST HEARD", width: 26 },
            { key: "reason", label: "REASON", width: 40 },
            { key: "id", label: "ID", width: 38 }
          ])
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_LIST_AGENTS_CONTRACT);
  return leaf;
}
