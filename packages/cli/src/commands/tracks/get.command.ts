import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { TRACK_READ_CONTRACT } from "../tracks.contract.generated";

const GET_HELP = `
Examples:
  $ nexus tracks get 11111111-1111-4111-8111-111111111111
  $ nexus tracks get 11111111-1111-4111-8111-111111111111 --json

Notes:
  A TRACK THAT IS NOT YOURS IS A 404, the same answer as one that does not
  exist. The two are deliberately indistinguishable, so this cannot be used to
  find out whether an id belongs to somebody else.
  nextOwnerRef IS ONLY EVER SET ALONGSIDE nextOwner EVENT. On a CUE or USER
  track it reads null, and that is the only legal pair.
  THIS DOES NOT REPORT PROGRESS. Run "nexus tracks rollup <trackId>" for the
  done/total counts over the task tree.
  Needs the "tracks:read" scope.`;

/** `nexus tracks get` */
export function registerTracksGetCommand(tracks: Command, program: Command): Command {
  const leaf = tracks
    .command("get")
    .description("One track by id")
    .argument("<trackId>", "The track to read")
    .addHelpText("after", GET_HELP)
    .action(async (trackId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const track = await client.tracks.get(trackId);

        // 🔴 EVERY FIELD THE PAYLOAD CARRIES, AND THE LIST IS HAND-BUILT, SO A
        // NEW ONE IS INVISIBLE UNTIL SOMEBODY ADDS IT HERE. `archivedAt` was
        // published on the wire precisely so a caller holding an id could tell a
        // live track from one that was put away — and this record rebuilt the
        // object without it, so both the terminal view and `--json` hid the one
        // fact the archive route exists to expose. Found by bugbot on #4146.
        printRecord({
          id: track.id,
          number: track.number,
          slug: track.slug,
          title: track.title,
          shortTitle: track.shortTitle,
          status: track.status,
          currentStep: track.currentStep,
          nextOwner: track.nextOwner,
          nextOwnerRef: track.nextOwnerRef,
          archivedAt: track.archivedAt,
          createdAt: track.createdAt,
          updatedAt: track.updatedAt
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_READ_CONTRACT);
  return leaf;
}
