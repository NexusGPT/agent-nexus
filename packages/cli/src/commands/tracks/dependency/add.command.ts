import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { TRACK_CREATE_DEPENDENCY_EDGE_CONTRACT } from "../../tracks.contract.generated";

const DEPENDENCY_ADD_HELP = `
Examples:
  $ nexus tracks dependency add \\
      --blocker 11111111-1111-4111-8111-111111111111 \\
      --blocked 22222222-2222-4222-8222-222222222222

Notes:
  AN EDGE THAT WOULD CLOSE A CIRCLE IS REFUSED WITH 409, and the refusal names
  the circle in traversal order. A two-node circle says so in those words,
  because "you already said B blocks A" is a thing a person can fix without
  reading a graph. When the names cannot be resolved inside the refusing
  transaction the circle comes back empty and the message says to re-read the
  dependencies.
  THE LOCK THIS TAKES IS ORGANISATION-WIDE, not per track. A track-level circle
  can run through any track in the organisation, so two inserts on two different
  tracks that jointly close one would otherwise never meet.
  ADDING AN EDGE CHANGES THE READY SET IMMEDIATELY, because "nexus tracks ready"
  is derived on every read. Only a blocker that has NOT reached DONE removes the
  blocked track from that set: an edge whose blocker is already DONE changes
  nothing.
  Needs the "tracks:write" scope.`;

/** `nexus tracks dependency add` */
export function registerTracksDependencyAddCommand(dependency: Command, program: Command): Command {
  const leaf = dependency
    .command("add")
    .description("Say that one track must finish before another may start")
    .requiredOption("--blocker <trackId>", "The track that must finish first")
    .requiredOption("--blocked <trackId>", "The track that waits")
    .addHelpText("after", DEPENDENCY_ADD_HELP)
    .action(async (opts: { blocker: string; blocked: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const edge = await client.tracks.createDependencyEdge({
          blockerTrackId: opts.blocker,
          blockedTrackId: opts.blocked
        });

        printSuccess("Dependency added.", { id: edge.id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_CREATE_DEPENDENCY_EDGE_CONTRACT);
  return leaf;
}
