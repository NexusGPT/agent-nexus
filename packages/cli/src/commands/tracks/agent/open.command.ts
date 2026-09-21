import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { TRACK_OPEN_AGENT_CONTRACT } from "../../tracks.contract.generated";

const AGENT_OPEN_HELP = `
Examples:
  $ nexus tracks agent open 11111111-1111-4111-8111-111111111111 --name plan-importer
  $ nexus tracks agent open 11111111-1111-4111-8111-111111111111 --name builder \\
      --depends-on plan-importer --acceptance "suite green" --output-path artifacts/build.log

Notes:
  OPENING AN AGENT STARTS NOTHING. It records that a contract exists, and the
  row is what other commands attribute work to. No process is spawned, no
  sandbox is created and no model is called.
  THE NAME IS UNIQUE AMONG OPEN AGENTS, THROUGH AN INDEX PRISMA CANNOT SEE. A
  second OPEN agent with the same name on the same track is a 409; closing the
  first one frees the name.
  --depends-on TAKES NAMES, NOT IDS, and nothing resolves them. It is a column
  recording what the author said, so a name that matches no agent is stored as
  written and blocks nothing.
  --model IS A LABEL. Nothing in this domain reads it to choose a model.
  Needs the "track_agents:write" scope.`;

/** `nexus tracks agent open` */
export function registerTracksAgentOpenCommand(agent: Command, program: Command): Command {
  const leaf = agent
    .command("open")
    .description("Open one agent on this track")
    .argument("<trackId>", "The track to open the agent on")
    .requiredOption("--name <name>", "1-128 chars. Unique among this track's OPEN agents")
    .option("--depends-on <names...>", "Other agents in this track, BY NAME")
    .option("--acceptance <text>", "What finishing this agent's work means")
    .option("--output-path <path>", "Where the agent is expected to write")
    .option("--model <model>", "A note about which model runs it. Nothing reads it")
    .addHelpText("after", AGENT_OPEN_HELP)
    .action(
      async (
        trackId: string,
        opts: {
          name: string;
          dependsOn?: string[];
          acceptance?: string;
          outputPath?: string;
          model?: string;
        }
      ) => {
        try {
          const client = createClient(program.optsWithGlobals());
          const opened = await client.tracks.openAgent(trackId, {
            name: opts.name,
            dependsOn: opts.dependsOn ?? [],
            acceptance: opts.acceptance ?? null,
            outputPath: opts.outputPath ?? null,
            model: opts.model ?? null
          });

          printSuccess("Agent opened.", { id: opened.id, name: opened.name, state: opened.state });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
  bindCommand(leaf, TRACK_OPEN_AGENT_CONTRACT);
  return leaf;
}
