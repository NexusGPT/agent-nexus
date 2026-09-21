import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { TRACK_RENAME_SECTION_CONTRACT } from "../../tracks.contract.generated";

const SECTION_RENAME_HELP = `
Examples:
  $ nexus tracks section rename 11111111-1111-4111-8111-111111111111 \\
      44444444-4444-4444-8444-444444444444 --slug research

Notes:
  ONE STATEMENT REWRITES THE WHOLE SUBTREE. rowsRewritten counts the section
  plus every descendant whose path actually changed, so 1 means it was a leaf
  and 0 means the new slug is the one it already had. Nothing walks the tree, and
  that is deliberate: a walk would leave a window in which some paths describe
  the new tree and some the old, and path is the column every lookup reads.
  A SIBLING ALREADY HOLDING THE NEW PATH IS A 409, and nothing is written.
  THE OLD PATH STOPS RESOLVING THE INSTANT THIS RETURNS. Anything that stored a
  path rather than an id has to be updated by whoever stored it.
  Needs the "track_sections:write" scope.`;

/** `nexus tracks section rename` */
export function registerTracksSectionRenameCommand(section: Command, program: Command): Command {
  const leaf = section
    .command("rename")
    .description("Re-slug one section; its whole subtree follows")
    .argument("<trackId>", "The track the section belongs to")
    .argument("<sectionId>", "The section to re-slug")
    .requiredOption(
      "--slug <slug>",
      "The new slug, 1-64 chars of [a-z0-9-], starting with a letter or digit"
    )
    .addHelpText("after", SECTION_RENAME_HELP)
    .action(async (trackId: string, sectionId: string, opts: { slug: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.renameSection(trackId, sectionId, {
          newSlug: opts.slug
        });

        printSuccess("Section renamed.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_RENAME_SECTION_CONTRACT);
  return leaf;
}
