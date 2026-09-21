import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope, printTable } from "../../../output";
import { TRACK_LIST_EVENTS_CONTRACT } from "../../tracks.contract.generated";

const EVENT_LIST_HELP = `
Examples:
  $ nexus tracks event list 11111111-1111-4111-8111-111111111111
  $ nexus tracks event list 11111111-1111-4111-8111-111111111111 --limit 100

Notes:
  THE STREAM IS APPEND ONLY AND THERE IS NO DELETE COMMAND, on the same terms as
  the diary. If events are ever pruned for volume that will be a retention
  policy, never a delete verb appearing here.
  EVERY EVENT NAMES AN ACTOR. A row with actorAgentId set and actorUserId null
  came from a machine credential with no owning user, which is an absent person
  rather than an anonymous one.
  --limit DEFAULTS TO 50 SERVER SIDE, so an unfiltered read of a busy track is
  not the whole stream.
  Needs the "track_events:read" scope.`;

/** `nexus tracks event list` */
export function registerTracksEventListCommand(event: Command, program: Command): Command {
  const leaf = event
    .command("list")
    .description("The track's event stream, newest first")
    .argument("<trackId>", "The track to read")
    .option("--limit <n>", "How many rows, 1-200", (value: string) => Number(value))
    .addHelpText("after", EVENT_LIST_HELP)
    .action(async (trackId: string, opts: { limit?: number }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listEvents(trackId, { limit: opts.limit });

        printEnvelope(result, () =>
          printTable(result.events, [
            { key: "createdAt", label: "WHEN", width: 26 },
            { key: "type", label: "TYPE", width: 32 },
            { key: "actorAgentId", label: "AGENT", width: 38 },
            { key: "id", label: "ID", width: 38 }
          ])
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_LIST_EVENTS_CONTRACT);
  return leaf;
}
