import type { TrackStatus } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import {
  TRACK_SET_STATUS__BODY_STATUS,
  TRACK_SET_STATUS_CONTRACT
} from "../tracks.contract.generated";

const SET_STATUS_HELP = `
Examples:
  $ nexus tracks set-status 11111111-1111-4111-8111-111111111111 --to DONE
  $ nexus tracks set-status 11111111-1111-4111-8111-111111111111 --to BLOCKED
  $ nexus tracks set-status 11111111-1111-4111-8111-111111111111 --to IN_PROGRESS --json

Notes:
  DONE IS HOW A TRACK ENDS, AND THERE IS NO DELETE. A finished track keeps its
  diary, its events and its memory — those ARE the record of how the work went,
  and every one of them would be destroyed with the row.
  DONE AND BLOCKED LEAVE "nexus tracks ready" ON THE VERY NEXT CALL. Nothing has
  to be refreshed and there is no cache. IN_REVIEW does NOT leave it: work
  waiting on a reviewer is still work somebody can pick up.
  A DONE TRACK IS STILL IN "nexus tracks list". That is the difference between
  the two reads — ready answers what can be worked on, list answers what exists.
  EVERY STATUS IS REACHABLE FROM EVERY OTHER ONE. A track marked DONE that turns
  out not to be takes one call to move back; there is no transition table and no
  escape hatch to find.
  A TRACK THAT IS NOT YOURS IS A 404, the same answer as one that does not
  exist. That is deliberate — the two must not be distinguishable.
  Needs the "tracks:write" scope.`;

// 🔴 `set-status` RATHER THAN `status`, AND THE NAME IS NOT A PREFERENCE.
// `status` is in `CHECK_VERBS` (`status-verdict.scan.ts`): a leaf with that
// name PROMISES A VERDICT a script can branch on, and must therefore carry its
// answer in its exit code. This is a WRITE — it has no verdict to carry — so
// the honest fix is to stop wearing the name, not to ledger an exemption. It
// also matches the SDK method (`tracks.setStatus`) exactly.
/** `nexus tracks set-status` */
export function registerTracksSetStatusCommand(tracks: Command, program: Command): Command {
  const leaf = tracks
    .command("set-status")
    .description("Move the track to a status — this is how a track finishes")
    .argument("<trackId>", "The track to move")
    .addOption(
      enumOption(
        "--to <status>",
        "Where the track is now",
        TRACK_SET_STATUS__BODY_STATUS
      ).makeOptionMandatory()
    )
    .addHelpText("after", SET_STATUS_HELP)
    .action(async (trackId: string, opts: { to: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.setStatus(trackId, {
          status: opts.to as TrackStatus
        });

        printSuccess("Status set.", { trackId: result.trackId, status: result.status });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_SET_STATUS_CONTRACT);
  return leaf;
}
