import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { TRACK_CREATE_SECTION_CONTRACT } from "../../tracks.contract.generated";

const SECTION_CREATE_HELP = `
Examples:
  $ nexus tracks section create 11111111-1111-4111-8111-111111111111 \\
      --slug discovery --title "Discovery"
  $ nexus tracks section create 11111111-1111-4111-8111-111111111111 \\
      --slug notes --title "Notes" --parent 44444444-4444-4444-8444-444444444444 --position 0

Notes:
  THE PATH IS THE ADDRESS, AND THE SLUG IS ITS LAST SEGMENT. A section nested
  under "discovery" with slug "notes" has the path "discovery/notes". A sibling
  already holding that path is a 409.
  --body-text FILLS THE SECTION'S PROSE, NOT THE REQUEST BODY. This command
  declares no --body flag, and neither does the root program; every field of
  this write has its own flag.
  A --position PAST THE END CLAMPS TO THE APPEND INDEX. A negative one is
  refused with a 400, and omitting it appends.
  THE WHOLE WRITE HOLDS THE TRACK'S ROW LOCK. Two sections created at the root
  at the same index would otherwise both be stored — Postgres treats NULL
  parents as distinct, so the sibling uniqueness index does not cover the root.
  Needs the "track_sections:write" scope.`;

/** `nexus tracks section create` */
export function registerTracksSectionCreateCommand(section: Command, program: Command): Command {
  const leaf = section
    .command("create")
    .description("Create one section, at a chosen index among its siblings")
    .argument("<trackId>", "The track to create the section in")
    .requiredOption(
      "--slug <slug>",
      "1-64 chars of [a-z0-9-], starting with a letter or digit. The last segment of the path"
    )
    .requiredOption("--title <title>", "What the section is called")
    .option("--parent <sectionId>", "Nest it under this section. Omit to create at the root")
    .option("--body-text <text>", "The section's prose")
    .option("--position <n>", "Index among its siblings. Omit to append", (v: string) => Number(v))
    .addHelpText("after", SECTION_CREATE_HELP)
    .action(
      async (
        trackId: string,
        opts: {
          slug: string;
          title: string;
          parent?: string;
          bodyText?: string;
          position?: number;
        }
      ) => {
        try {
          const client = createClient(program.optsWithGlobals());
          const created = await client.tracks.createSection(trackId, {
            slug: opts.slug,
            title: opts.title,
            parentSectionId: opts.parent ?? null,
            ...(opts.bodyText !== undefined && { body: opts.bodyText }),
            ...(opts.position !== undefined && { position: opts.position })
          });

          printSuccess("Section created.", {
            id: created.id,
            path: created.path,
            position: created.position
          });
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );
  bindCommand(leaf, TRACK_CREATE_SECTION_CONTRACT);
  return leaf;
}
