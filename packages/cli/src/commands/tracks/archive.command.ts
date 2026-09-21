import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { TRACK_ARCHIVE_CONTRACT } from "../tracks.contract.generated";

const ARCHIVE_HELP = `
Examples:
  $ nexus tracks archive 11111111-1111-4111-8111-111111111111
  $ nexus tracks archive 11111111-1111-4111-8111-111111111111 --undo
  $ nexus tracks list --archived only

Notes:
  A TRACK IS NEVER DELETED, AND THIS IS WHY. A track's diary, its
  events and its memory are the record of how the work went, and every one of
  them is destroyed with the row. Archiving takes the track out of the way and
  leaves all of it readable.
  IT IS REVERSIBLE. Run it again with --undo. An archive nobody can undo is a
  delete whose damage is only harder to see.
  FIND WHAT YOU PUT AWAY WITH "nexus tracks list --archived only". An archived
  track is absent from "nexus tracks ready" and from the default page of
  "nexus tracks list", so that flag is the only way back to it.
  IT DOES NOT TOUCH THE STATUS. DONE says the work finished; archived says the
  track was put away, which a PLANNED track that turned out to be a mistake
  also is. Use "nexus tracks set-status" for the other one.
  A TRACK THAT IS NOT YOURS IS A 404, the same answer as one that does not
  exist.
  Needs the "tracks:write" scope.`;

// 🔴 THIS IS THE NAMESPACE'S ANSWER TO "DELETE A TRACK", AND THERE IS NO
// `tracks delete`. A track's diary, events and memory are children of the row
// under ON DELETE CASCADE, so a real delete destroys the record of how the
// work went. This writes one nullable column instead.
//
// ONE COMMAND, BOTH DIRECTIONS, on `tracks task toggle`'s established shape —
// an `archive`/`unarchive` pair would be two commands onto one column, which
// is how they drift.
//
// THE NOTE BELOW SAYS THERE IS NO DELETE WITHOUT SPELLING ONE. `help-claims`
// rule C1 is TOTAL — every `nexus <words>` string in help PROSE must resolve
// against the live commander tree, and it has no way to read a negation. So a
// sentence denying a command still cites it, and the gate is right to red.
// State the absence in words; keep the quoted form for commands that exist.
/** `nexus tracks archive` */
export function registerTracksArchiveCommand(tracks: Command, program: Command): Command {
  const leaf = tracks
    .command("archive")
    .description("Put the track away, or bring it back — this is instead of deleting it")
    .argument("<trackId>", "The track to put away")
    .option("--undo", "Bring it back instead of putting it away")
    .addHelpText("after", ARCHIVE_HELP)
    .action(async (trackId: string, opts: { undo?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // `--undo` is the ONLY spelling of the reverse, and its absence means
        // archive. A `--archived <bool>` flag would put a querystring boolean in
        // a human's hands, where "false" reads as true to more than one parser.
        const archived = opts.undo !== true;
        const result = await client.tracks.archive(trackId, { archived });

        printSuccess(archived ? "Track archived." : "Track restored.", {
          trackId: result.trackId,
          archivedAt: result.archivedAt
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_ARCHIVE_CONTRACT);
  return leaf;
}
