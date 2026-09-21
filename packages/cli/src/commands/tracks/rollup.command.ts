import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { TRACK_READ_ROLLUP_CONTRACT } from "../tracks.contract.generated";

const ROLLUP_HELP = `
Examples:
  $ nexus tracks rollup 11111111-1111-4111-8111-111111111111
  $ nexus tracks rollup 11111111-1111-4111-8111-111111111111 --json

Notes:
  COUNTS, NEVER A PERCENTAGE. Divide them yourself. A percentage is a display
  decision, and a caller handed one cannot recover the counts.
  IT COUNTS LEAVES ONLY, at any nesting depth. A parent task is structure
  rather than work, so it is in neither number: one parent holding three
  children reads 0/3, never 0/4.
  IT COUNTS STEP LEAVES ONLY. A DECISION or a DEFINITION is content recorded on
  the board — a choice that was taken, a rule that was settled — and is never
  outstanding work, so it is in neither number either. byKind is the whole task
  set partitioned, so you can see exactly what done/total left out. A STEP whose
  only children are content is a LEAF rather than structure, so the work it
  names does not vanish with them.
  0/0 IS NOT AN ERROR AND IT MEANS A REAL, READABLE TRACK WITH NO WORK ON IT.
  A track you cannot reach is a 404, and that one answer covers an absent id,
  another organization's and an ungranted one alike — so the status code tells
  you the track is unreachable without ever telling you whether it exists.
  Needs the "tracks:read" scope.`;

/** `nexus tracks rollup` */
export function registerTracksRollupCommand(tracks: Command, program: Command): Command {
  const leaf = tracks
    .command("rollup")
    .description("The track's progress — leaves done, leaves total")
    .argument("<trackId>", "The track to report on")
    .addHelpText("after", ROLLUP_HELP)
    .action(async (trackId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const progress = await client.tracks.readRollup(trackId);

        // 🔴 `byKind` IS PRINTED BESIDE THE COUNTS BECAUSE THE COUNTS NARROWED.
        // `done`/`total` count STEP leaves, so a reader seeing a denominator
        // smaller than the plan needs the partition in the same answer — a
        // number that excludes rows without saying which is a number nobody can
        // check. Flattened rather than nested: `printRecord` renders one level,
        // and an object value would print as [object Object].
        printRecord({
          done: progress.done,
          total: progress.total,
          steps: progress.byKind.STEP,
          decisions: progress.byKind.DECISION,
          definitions: progress.byKind.DEFINITION
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_READ_ROLLUP_CONTRACT);
  return leaf;
}
