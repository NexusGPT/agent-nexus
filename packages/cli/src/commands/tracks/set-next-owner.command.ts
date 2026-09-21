import type { TrackNextOwner } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import {
  TRACK_SET_NEXT_OWNER__BODY_NEXT_OWNER,
  TRACK_SET_NEXT_OWNER_CONTRACT
} from "../tracks.contract.generated";

const SET_NEXT_OWNER_HELP = `
Examples:
  $ nexus tracks set-next-owner 11111111-1111-4111-8111-111111111111 --to CUE
  $ nexus tracks set-next-owner 11111111-1111-4111-8111-111111111111 --to USER
  $ nexus tracks set-next-owner 11111111-1111-4111-8111-111111111111 \\
      --to EVENT --ref deploy-watcher-7

Notes:
  THIS IS THE PER-TURN HANDOVER, and it is what "nexus tracks ready" prints
  under WAITING ON. CUE means an agent can proceed, USER means a person has to
  act, EVENT means something outside has to happen first.
  --ref IS CLEARED WHENEVER YOU OMIT IT. It is written on every call and never
  merged, so moving a track from EVENT to USER drops the watcher in the same
  statement. That is not a convenience: the server admits a ref only alongside
  EVENT, so a leftover one would make the next handover fail for a field you did
  not send.
  --ref WITH CUE OR USER IS REFUSED WITH A 400 that names the field. Send it
  with EVENT, or send --to on its own.
  A TRACK THAT IS NOT YOURS IS A 404, the same answer as one that does not
  exist.
  Needs the "tracks:write" scope.`;

// `set-next-owner` to sit beside `set-status` above and to match the SDK
// method (`tracks.setNextOwner`). `next-owner` alone would pass every gate —
// it is not a check verb — and two writes landing together under two naming
// schemes is a thing to get wrong later.
/** `nexus tracks set-next-owner` */
export function registerTracksSetNextOwnerCommand(tracks: Command, program: Command): Command {
  const leaf = tracks
    .command("set-next-owner")
    .description("Say who acts next on this track")
    .argument("<trackId>", "The track to hand over")
    .addOption(
      enumOption(
        "--to <owner>",
        "Who is waited on",
        TRACK_SET_NEXT_OWNER__BODY_NEXT_OWNER
      ).makeOptionMandatory()
    )
    .option("--ref <ref>", "The watcher or agent being waited on. Only with EVENT")
    .addHelpText("after", SET_NEXT_OWNER_HELP)
    .action(async (trackId: string, opts: { to: string; ref?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.setNextOwner(trackId, {
          nextOwner: opts.to as TrackNextOwner,
          // Always sent, never conditional. An omitted --ref MEANS null here,
          // and that is what clears the watcher; spreading it only when present
          // would leave the old value in place and break the next handover.
          nextOwnerRef: opts.ref ?? null
        });

        printSuccess(
          result.nextOwnerRef === null ? "Next owner set." : "Next owner set, watching an event.",
          {
            trackId: result.trackId,
            nextOwner: result.nextOwner,
            nextOwnerRef: result.nextOwnerRef
          }
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_SET_NEXT_OWNER_CONTRACT);
  return leaf;
}
