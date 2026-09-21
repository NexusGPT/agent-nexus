import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";
import { TRACK_DELETE_MEMORY_ENTRY_CONTRACT } from "../../tracks.contract.generated";

const MEMORY_DELETE_HELP = `
Examples:
  $ nexus tracks memory delete 11111111-1111-4111-8111-111111111111 staging-url

Notes:
  IT IS IDEMPOTENT. deleted: false means the key was already absent, and that is
  a success, not a failure — read the field rather than the exit code to tell
  the two apart.
  THE BYTES ARE REFUNDED IN THE SAME TRANSACTION, so the trackMemoryBytes this
  returns is already the new total.
  THIS IS THE ONLY VERB THAT REMOVES A ROW. The diary and the event stream
  deliberately have none. It is not the only destructive one:
  "nexus tracks task toggle --done false" erases a task's evidence, and it does
  not ask first.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  Needs the "track_memory:delete" scope.`;

/** `nexus tracks memory delete` */
export function registerTracksMemoryDeleteCommand(memory: Command, program: Command): Command {
  const leaf = confirmable(memory.command("delete"))
    .description("Remove one memory entry and refund its bytes")
    .argument("<trackId>", "The track to write to")
    .argument("<key>", "The key to remove")
    .addHelpText("after", MEMORY_DELETE_HELP)
    .action(async (trackId: string, key: string, opts: { yes?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete memory key "${key}" on track ${trackId}?`, opts)))
          return;

        const result = await client.tracks.deleteMemoryEntry(trackId, key);

        printSuccess(result.deleted ? "Memory entry removed." : "No such key.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, TRACK_DELETE_MEMORY_ENTRY_CONTRACT);
  return leaf;
}
