import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printEnvelope } from "../../output";
import { TRACK_LIST_READY_CONTRACT } from "../tracks.contract.generated";
import { renderReadyTracks } from "./ready.render";

const READY_HELP = `
Examples:
  $ nexus tracks ready
  $ nexus tracks ready --limit 5
  $ nexus tracks ready --json

Notes:
  THIS IS DERIVED ON EVERY READ AND THERE IS NOTHING TO REFRESH. The ready set
  is a join over the dependency edges, so marking a blocker done makes its
  dependents appear in the very next call. There is no readyAt column, no cache
  and no invalidation step to run first.
  THE ORDER IS THE TRACK NUMBER, ASCENDING, so the oldest track comes first.
  AN EMPTY LIST IS AN ANSWER, NOT A FAILED READ. A track is absent when it is
  DONE or BLOCKED, when it is archived, or when any track it waits on has not
  reached DONE — a blocker still PLANNED, IN_PROGRESS or IN_REVIEW holds it
  exactly as hard as one that is BLOCKED. An organization with no tracks at all
  reads the same. Run "nexus tracks ready --json" and check for an empty array
  rather than reading the dimmed "No results." line as an error.
  --limit DEFAULTS TO 50 SERVER SIDE, SO A TRACK IS ALSO ABSENT WHEN IT FELL OFF
  THE PAGE. That is a fifth reason, it needs no flag to happen, and it is the
  one this list used to omit. The order is the track number ascending and a new
  track takes the highest number, so the tracks a default page hides are always
  the NEWEST ones — including one you just created.
  THE ANSWER SAYS WHEN A PAGE WAS CUT. hasMore is true when the ready set is
  larger than this page, and the footer under the table says so. Raise --limit,
  up to 200, and re-read before reading an absence as DONE, BLOCKED, archived or
  dependency-held. There is deliberately no total and no cursor: this route
  answers what can be worked on now, and "nexus tracks list" is the paged surface
  when a caller needs to walk a set.
  nextOwner SAYS WHO IS WAITED ON, NOT WHO OWNS THE TRACK. CUE means an agent
  can proceed, USER means a person has to act, EVENT means something outside
  has to happen first.
  Needs the "tracks:read" scope.`;

/** `nexus tracks ready` */
export function registerTracksReadyCommand(tracks: Command, program: Command): Command {
  const leaf = tracks
    .command("ready")
    .description("The tracks that can be worked on right now")
    .option("--limit <n>", "How many rows, 1-200", (value: string) => Number(value))
    .addHelpText("after", READY_HELP)
    .action(async (opts: { limit?: number }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listReady({ limit: opts.limit });

        // 🚨 EVERY LIST IN THIS NAMESPACE PRINTS THE WHOLE ENVELOPE UNDER --json,
        // AND THE ONE PLACE IT MATTERS IS `memory list`: its envelope carries
        // `trackMemoryBytes` and `budgetBytes` beside the rows, and printing the
        // array alone put the byte budget — the entire reason that read exists —
        // out of reach of every script. One rule across the namespace rather than
        // an exception on the one command that needs it, because the narrowing is
        // copy-paste: the table wants one array, so the action takes one array,
        // and the document silently inherits the table's taste.
        printEnvelope(result, () => renderReadyTracks(result));
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_LIST_READY_CONTRACT);
  return leaf;
}
