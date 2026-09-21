import type { TrackNextOwner, TrackStatus } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printEnvelope } from "../../output";
import {
  TRACK_LIST__PARAMS_ARCHIVED,
  TRACK_LIST__PARAMS_NEXT_OWNER,
  TRACK_LIST__PARAMS_STATUS,
  TRACK_LIST_CONTRACT
} from "../tracks.contract.generated";
import { renderTrackList } from "./list.render";

const LIST_HELP = `
Examples:
  $ nexus tracks list
  $ nexus tracks list --status DONE
  $ nexus tracks list --next-owner USER
  $ nexus tracks list --limit 200 --json

Notes:
  THIS IS NOT "nexus tracks ready". That one answers what can be worked on and
  hides everything DONE, BLOCKED or blocked by a dependency. This answers what
  EXISTS, so a track you finished is here and nowhere else.
  IT IS ORDERED BY NUMBER AND NOTHING ELSE. Nothing in a track can rank it —
  there is no priority, no estimate and no due date — so any other order would
  assert a ranking the product does not hold.
  ARCHIVED TRACKS ARE HIDDEN BY DEFAULT. Run with --archived only to find one
  you put away, and --archived include to see both at once. That is the entire
  recovery path for "nexus tracks archive", and it is why archiving is not a
  delete.
  --next-owner NAMES A KIND OF ACTOR, NOT A PERSON. USER means a human is due
  next, CUE means the agent, EVENT means an external watcher. It is what the
  WAITING ON column shows. There is no per-user filter anywhere in this API, so
  --next-owner USER is "waiting on a human" and not "waiting on you".
  AN EMPTY LIST MEANS NO TRACK MATCHED YOUR FILTERS, not that the read failed.
  Run with --json and check for an empty array rather than reading the dimmed
  "No results." line as an error.
  A NON-EMPTY PAGE MAY STILL BE PARTIAL, AND --limit DEFAULTS TO 50 SERVER SIDE.
  Unlike the two ready reads, this answer says so: it carries total, hasMore and
  nextCursor, the footer under the table prints how many of how many you are
  looking at, and it names the exact command for the rest.
  PAGE WITH --cursor, NEVER AN OFFSET, and there is no offset flag to reach for.
  The ceiling is 200 rows, so an organization past 200 tracks is reachable ONLY
  by paging. Round-trip the token verbatim and stop when hasMore is false.
  A CURSOR CARRIES THE FILTERS IT WAS ISSUED UNDER. Replaying it under a
  different --status, --archived or --next-owner is refused with a 400 rather
  than quietly resuming inside a different list, so change a filter and start
  again from the first page. --limit is not bound in.
  Needs the "tracks:read" scope.`;

/** `nexus tracks list` */
export function registerTracksListCommand(tracks: Command, program: Command): Command {
  const leaf = tracks
    .command("list")
    .description("Every track in your organization — what exists, not what is ready")
    .option("--limit <n>", "How many rows, 1-200", (value: string) => Number(value))
    .option("--cursor <cursor>", "A `nextCursor` from a previous page. Never build one")
    .addOption(enumOption("--status <status>", "Narrow to one status", TRACK_LIST__PARAMS_STATUS))
    .addOption(
      enumOption(
        "--archived <mode>",
        "What to do about archived tracks. exclude when omitted",
        TRACK_LIST__PARAMS_ARCHIVED
      )
    )
    .addOption(
      enumOption(
        "--next-owner <owner>",
        "Only tracks waiting on this kind of actor. Every owner when omitted",
        TRACK_LIST__PARAMS_NEXT_OWNER
      )
    )
    .addHelpText("after", LIST_HELP)
    .action(
      async (opts: {
        limit?: number;
        cursor?: string;
        status?: string;
        archived?: string;
        nextOwner?: string;
      }) => {
        try {
          const client = createClient(program.optsWithGlobals());
          const result = await client.tracks.list({
            limit: opts.limit,
            ...(opts.cursor !== undefined && { cursor: opts.cursor }),
            ...(opts.status !== undefined && { status: opts.status as TrackStatus }),
            ...(opts.archived !== undefined && {
              archived: opts.archived as "exclude" | "only" | "include"
            }),
            ...(opts.nextOwner !== undefined && { nextOwner: opts.nextOwner as TrackNextOwner })
          });

          printEnvelope(result, () => renderTrackList(result, opts));
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
  bindCommand(leaf, TRACK_LIST_CONTRACT);
  return leaf;
}
