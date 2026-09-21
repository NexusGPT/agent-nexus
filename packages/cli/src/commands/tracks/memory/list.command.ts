import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { color, printEnvelope, printTable } from "../../../output";
import { TRACK_LIST_MEMORY_ENTRIES_CONTRACT } from "../../tracks.contract.generated";

const MEMORY_LIST_HELP = `
Examples:
  $ nexus tracks memory list 11111111-1111-4111-8111-111111111111
  $ nexus tracks memory list 11111111-1111-4111-8111-111111111111 --json

Notes:
  THE BUDGET IS BYTES, NOT CHARACTERS: 8000 per track and 2000 per entry.
  valueBytes is UTF-8 length, so a short string of CJK or emoji can cost three
  or four times its visible length.
  trackMemoryBytes IS SUMMED FROM THE ROWS THIS READ RETURNED, not taken from
  the counter column. That is deliberate: it makes any divergence between the
  two visible here instead of hiding it behind the counter that is supposed to
  track it.
  A FULL BUDGET IS A 409 ON THE NEXT WRITE, not a silent truncation. Delete an
  entry to make room.
  Needs the "track_memory:read" scope.`;

/** `nexus tracks memory list` */
export function registerTracksMemoryListCommand(memory: Command, program: Command): Command {
  const leaf = memory
    .command("list")
    .description("Every memory entry on the track, with the byte budget")
    .argument("<trackId>", "The track to read")
    .addHelpText("after", MEMORY_LIST_HELP)
    .action(async (trackId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.listMemoryEntries(trackId);

        printEnvelope(result, () => {
          printTable(result.entries, [
            { key: "key", label: "KEY", width: 28 },
            { key: "valueBytes", label: "BYTES", width: 8 },
            { key: "value", label: "VALUE", width: 64 },
            { key: "updatedAt", label: "UPDATED", width: 26 }
          ]);

          // 🔴 THE BUDGET IS THE ENTIRE REASON THIS READ EXISTS, AND ONLY --json
          // COULD SEE IT. `trackMemoryBytes` and `budgetBytes` have been on this
          // envelope the whole time and the table printed neither, so the one
          // number a person needs BEFORE writing — how much room is left — was
          // reachable only from the channel a person is not using. This command's
          // own one-line description promises "with the byte budget", which made
          // the help a claim the output did not keep.
          //
          // `budgetBytes` appears EXACTLY ONCE in the whole wire surface, on this
          // response, so there was no other command a human could get it from.
          // `memory put` already prints the running total on its success line,
          // which is what left the list view as the single place it went missing.
          //
          // "byte(s)" rather than a pluralised noun, for the reason `tracks list`
          // gives: this line renders at n=1 as readily as at n=8000.
          //
          // Human channel only — `printEnvelope` returns before calling this
          // under `--json`, where both fields are already in the document, so a
          // script's answer cannot be contaminated by it.
          console.log(
            color.dim(`\n${result.trackMemoryBytes} of ${result.budgetBytes} byte(s) used.`)
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_LIST_MEMORY_ENTRIES_CONTRACT);
  return leaf;
}
