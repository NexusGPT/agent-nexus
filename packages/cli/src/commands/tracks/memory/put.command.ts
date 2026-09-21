import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { TRACK_PUT_MEMORY_ENTRY_CONTRACT } from "../../tracks.contract.generated";

const MEMORY_PUT_HELP = `
Examples:
  $ nexus tracks memory put 11111111-1111-4111-8111-111111111111 \\
      --key staging-url --value https://api-staging.example.com

Notes:
  THE KEY IS A SLUG BECAUSE THE DELETE ROUTE ADDRESSES IT AS A PATH SEGMENT. A
  key holding a slash could be written and never removed, which is the shape
  that silently consumes the budget for ever.
  THE BUDGET IS BYTES AND A WRITE WITH NO ROOM IS A 409: 8000 per track, 2000
  per entry. Nothing is truncated and nothing is evicted to make space.
  PUT REPLACES. Writing an existing key overwrites its value and re-counts its
  bytes; there is no append.
  Needs the "track_memory:write" scope.`;

/** `nexus tracks memory put` */
export function registerTracksMemoryPutCommand(memory: Command, program: Command): Command {
  const leaf = memory
    .command("put")
    .description("Create or replace one memory entry")
    .argument("<trackId>", "The track to write to")
    .requiredOption("--key <key>", "1-128 chars of [A-Za-z0-9._-], starting with a letter or digit")
    .requiredOption("--value <text>", "What to remember")
    .addHelpText("after", MEMORY_PUT_HELP)
    .action(async (trackId: string, opts: { key: string; value: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.tracks.putMemoryEntry(trackId, {
          key: opts.key,
          value: opts.value
        });

        printSuccess("Memory written.", {
          key: result.entry.key,
          valueBytes: result.entry.valueBytes,
          trackMemoryBytes: result.trackMemoryBytes
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_PUT_MEMORY_ENTRY_CONTRACT);
  return leaf;
}
