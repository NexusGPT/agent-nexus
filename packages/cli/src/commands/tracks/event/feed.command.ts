import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope, printTable } from "../../../output";
import { TRACK_LIST_ORGANIZATION_EVENTS_CONTRACT } from "../../tracks.contract.generated";

const EVENT_FEED_HELP = `
Examples:
  $ nexus tracks event feed
  $ nexus tracks event feed --limit 100 --type task.claimed
  $ nexus tracks event feed --since 2026-08-01T00:00:00.000Z
  $ nexus tracks event feed --cursor "$(nexus tracks event feed --limit 1 --json | jq -r .nextCursor)"

Notes:
  THIS IS THE WHOLE ORGANISATION, NOT ONE TRACK — every track's events plus the
  ones that name no track. "tracks event list <trackId>" is the per-track read.
  PAGE WITH --cursor, NEVER AN OFFSET, and there is no offset flag to reach for.
  The stream is append only and read newest first, so rows arrive at the head of
  the page you are walking: an offset window would re-serve rows and silently
  skip others. Feed nextCursor back and stop only when it is null.
  A FULL PAGE ALWAYS RETURNS A CURSOR, even when it was the last one — so the
  walk ends with one call that returns no events. That is the ending, not a bug.
  A CURSOR CARRIES THE FILTERS IT WAS ISSUED UNDER, and replaying it with a
  different --since or --type is refused with a 400. That is deliberate: a
  cursor is a position INSIDE a filtered set, so honouring it across a filter
  change would return a correctly-scoped page that starts in the middle, and you
  would have no way to tell. Change filters, start from the first page. --limit
  is not bound in; a bigger page mid-walk is fine.
  ROUND-TRIP THE CURSOR VERBATIM, never build one. It also encodes a position in
  the current sort order, which a hand-built token cannot know.
  --since IS A FULL INSTANT, not a date. "2026-08-01" is refused rather than
  read as midnight, because a mistyped bound that silently returns a different
  window is worse than an error.
  THERE IS NO TOTAL. Counting an append-only stream costs a second scan for a
  number that is stale before it is printed.
  Needs the "track_events:read" scope.`;

/** `nexus tracks event feed` */
export function registerTracksEventFeedCommand(event: Command, program: Command): Command {
  const leaf = event
    .command("feed")
    .description("Every event in the organisation, newest first")
    .option("--limit <n>", "How many rows per page, 1-200", (value: string) => Number(value))
    .option("--cursor <cursor>", "A `nextCursor` from a previous page. Never build one")
    .option("--since <iso>", "Only events at or after this instant, full ISO-8601")
    .option("--type <type>", "Only this exact event type")
    .addHelpText("after", EVENT_FEED_HELP)
    .action(async (opts: { limit?: number; cursor?: string; since?: string; type?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listOrganizationEvents({
          limit: opts.limit,
          cursor: opts.cursor,
          since: opts.since,
          type: opts.type
        });

        printEnvelope(result, () =>
          printTable(result.events, [
            { key: "createdAt", label: "WHEN", width: 26 },
            { key: "type", label: "TYPE", width: 32 },
            { key: "trackId", label: "TRACK", width: 38 },
            { key: "id", label: "ID", width: 38 }
          ])
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_LIST_ORGANIZATION_EVENTS_CONTRACT);
  return leaf;
}
