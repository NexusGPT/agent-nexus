import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope, printTable } from "../../../output";
import { TRACK_LIST_SECTIONS_CONTRACT } from "../../tracks.contract.generated";

const SECTION_LIST_HELP = `
Examples:
  $ nexus tracks section list 11111111-1111-4111-8111-111111111111
  $ nexus tracks section list 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE SECTION TREE IS NOT THE TASK TREE. Sections are the track's DOCUMENT — an
  outline with prose under each heading. Tasks are the work, and no task belongs
  to a section: they are two independent hierarchies over one track. "nexus
  tracks task list" is the other one.
  ROWS ARRIVE IN "path" ORDER, so every parent precedes its children and the
  tree builds in one pass. "path" is parent/child, so string order is
  depth-first order. POSITION ORDERS SIBLINGS and is what the board shows.
  BODY IS THE PROSE AND IS NEVER NULL. A section nobody has written under
  carries the empty string, so branching on null branches on a value this API
  does not produce. Use --json to read it; the table shows a length only.
  IT IS NOT PAGED, and there is no --limit. An outline only means anything
  whole, because parentSectionId has to resolve inside the answer.
  A FOREIGN TRACK AND AN ABSENT ONE ARE BOTH REFUSED WITH 404, IDENTICALLY.
  You cannot tell them apart and that is deliberate: a different answer would
  tell you whether another organisation's track id exists.
  Needs the "track_sections:read" scope, which a key holding
  "track_sections:write" already satisfies.`;

/** `nexus tracks section list` */
export function registerTracksSectionListCommand(section: Command, program: Command): Command {
  const leaf = section
    .command("list")
    .description("The track's whole document tree, prose included")
    .argument("<trackId>", "The track to read")
    .addHelpText("after", SECTION_LIST_HELP)
    .action(async (trackId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listSections(trackId);

        printEnvelope(result, () =>
          printTable(
            result.sections.map((s) => ({ ...s, bodyChars: s.body.length })),
            [
              { key: "path", label: "PATH", width: 40 },
              { key: "title", label: "TITLE", width: 40 },
              { key: "position", label: "POS", width: 5 },
              { key: "bodyChars", label: "PROSE", width: 7 },
              { key: "id", label: "ID", width: 38 }
            ]
          )
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_LIST_SECTIONS_CONTRACT);
  return leaf;
}
