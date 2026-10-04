import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus conversation get-metadata` */
export function registerConversationGetMetadataCommand(
  conversation: Command,
  program: Command
): void {
  conversation
    .command("get-metadata")
    .description("Get the custom metadata stored on a conversation")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation get-metadata 11111111-1111-4111-8111-111111111111
  $ nexus conversation get-metadata 11111111-1111-4111-8111-111111111111 --json

Notes:
  Read this before "update-metadata": the merge is per key, so you need to
  know which keys already exist to avoid overwriting one.
  An empty object means no metadata has been attached; it is not an error.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.conversations.getMetadata(id);
        printRecord(result.metadata);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
