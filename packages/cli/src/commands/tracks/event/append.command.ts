import type { AppendTrackEventBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { resolveRequiredBody } from "../../../util/body";
import { TRACK_APPEND_EVENT_CONTRACT } from "../../tracks.contract.generated";

const EVENT_APPEND_HELP = `
Examples:
  $ nexus tracks event append 11111111-1111-4111-8111-111111111111 \\
      --type task.claimed --agent 33333333-3333-4333-8333-333333333333
  $ nexus tracks event append 11111111-1111-4111-8111-111111111111 \\
      --type build.failed --agent 33333333-3333-4333-8333-333333333333 \\
      --payload '{"exitCode":2}'

Notes:
  --agent IS REQUIRED HERE AND IT IS NOT REQUIRED ON THE INTERNAL SURFACE. An
  event needs a user or an agent, and an API key may resolve no owning user — so
  demanding the agent is what makes an actorless event impossible at the door
  instead of a 500 from a database constraint. Your key's owning user is
  recorded alongside it when there is one.
  WHERE AN AGENT ID COMES FROM: "nexus tracks agent open" opens an agent on a
  track and prints its id, and "nexus tracks agent list" shows the ones already
  OPEN there. --agent is REQUIRED here and takes an ID ONLY — it resolves no
  name, unlike "nexus tracks task claim" — and "nexus tracks agent" is a
  different parent from "nexus tracks event", so neither verb appears on this
  screen's own help or on its parent's.
  THE PAYLOAD IS OPAQUE AND NOTHING QUERIES ACROSS IT. Store what a reader will
  need; nothing indexes its fields.
  THE STREAM IS APPEND ONLY. There is no way to remove or edit an event.
  Needs the "track_events:write" scope.`;

/** `nexus tracks event append` */
export function registerTracksEventAppendCommand(event: Command, program: Command): Command {
  const leaf = event
    .command("append")
    .description("Append one event to the track's stream")
    .argument("<trackId>", "The track to append to")
    .requiredOption("--type <type>", "What happened, 1-128 chars")
    .requiredOption("--agent <agentId>", "The agent that caused it")
    .option("--payload <json>", "The event's own body as JSON, a .json file, or '-' for stdin")
    .addHelpText("after", EVENT_APPEND_HELP)
    .action(async (trackId: string, opts: { type: string; agent: string; payload?: string }) => {
      try {
        const payload =
          opts.payload === undefined ? undefined : await resolveRequiredBody(opts.payload);
        const client = createClient(program.optsWithGlobals());
        const appended = await client.tracks.appendEvent(trackId, {
          type: opts.type,
          actorAgentId: opts.agent,
          ...(payload !== undefined && { payload })
        } satisfies AppendTrackEventBody);

        printSuccess("Event appended.", { id: appended.id, type: appended.type });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_APPEND_EVENT_CONTRACT);
  return leaf;
}
