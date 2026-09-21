import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printEnvelope, printTable } from "../../../output";
import {
  TRACK_LIST_DIARY_ENTRIES__PARAMS_KIND,
  TRACK_LIST_DIARY_ENTRIES_CONTRACT
} from "../../tracks.contract.generated";

const DIARY_LIST_HELP = `
Examples:
  $ nexus tracks diary list 11111111-1111-4111-8111-111111111111
  $ nexus tracks diary list 11111111-1111-4111-8111-111111111111 --kind DECISION --limit 20

Notes:
  THE LOG IS APPEND ONLY AND THERE IS NO DELETE COMMAND, in any spelling. A
  wrong entry is corrected by appending a later one, which is what makes this
  admissible as a record of what happened rather than of what somebody last
  decided should have happened.
  --limit DEFAULTS TO 50 SERVER SIDE. An unfiltered read of a long-running track
  is therefore not the whole log; ask for more explicitly.
  authorUserId IS NULL WHEN THE WRITE CAME FROM A KEY WITH NO OWNING USER. That
  is an absent author, not an anonymous one — nothing fabricates a name.
  Needs the "track_diary:read" scope.`;

/** `nexus tracks diary list` */
export function registerTracksDiaryListCommand(diary: Command, program: Command): Command {
  const leaf = diary
    .command("list")
    .description("The track's log, newest first")
    .argument("<trackId>", "The track to read")
    .addOption(
      enumOption(
        "--kind <kind>",
        "Only entries of this kind",
        TRACK_LIST_DIARY_ENTRIES__PARAMS_KIND
      )
    )
    .option("--limit <n>", "How many rows, 1-200", (value: string) => Number(value))
    .addHelpText("after", DIARY_LIST_HELP)
    .action(async (trackId: string, opts: { kind?: string; limit?: number }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listDiaryEntries(trackId, {
          kind: opts.kind as never,
          limit: opts.limit
        });

        printEnvelope(result, () =>
          printTable(result.entries, [
            { key: "createdAt", label: "WHEN", width: 26 },
            { key: "kind", label: "KIND", width: 10 },
            { key: "body", label: "ENTRY", width: 64 },
            { key: "id", label: "ID", width: 38 }
          ])
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_LIST_DIARY_ENTRIES_CONTRACT);
  return leaf;
}
