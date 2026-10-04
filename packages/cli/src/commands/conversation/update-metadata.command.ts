import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { resolveBody } from "../../util/body";

/** `nexus conversation update-metadata` */
export function registerConversationUpdateMetadataCommand(
  conversation: Command,
  program: Command
): void {
  conversation
    .command("update-metadata")
    .description("Shallow-merge custom metadata into a conversation")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .option("--body <json>", "Metadata patch as JSON, .json file, or '-' for stdin")
    .option(
      "--set <key=value...>",
      "Set keys (value parsed as JSON when valid, else string). Repeatable."
    )
    .option("--unset <key...>", "Clear keys (sends null to delete them). Repeatable.")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation update-metadata 11111111-1111-4111-8111-111111111111 --set priority=high externalId=CRM-123
  $ nexus conversation update-metadata 11111111-1111-4111-8111-111111111111 --set 'flags={"vip":true}'
  $ nexus conversation update-metadata 11111111-1111-4111-8111-111111111111 --unset legacyField
  $ nexus conversation update-metadata 11111111-1111-4111-8111-111111111111 --body '{"priority":"high","old":null}'

Notes:
  THE MERGE IS ONE LEVEL DEEP. A non-null value REPLACES that key outright, a
  null clears it, and keys you do not mention are untouched — so sending
  '{"flags":{"vip":true}}' discards every other key inside flags. Read
  "conversation get-metadata <id>" first and send the object back whole.

  --set PARSES ITS VALUE AS JSON WHEN IT CAN, so the type is decided by what
  you typed: priority=high stores the string "high", count=5 stores the NUMBER
  5, and ok=true stores a BOOLEAN. Quote to force a string: 'count="5"'.
  --set key=null DELETES THE KEY. It parses to a JSON null, and null is the
  clear signal — it does not store a null value. That is what --unset does,
  spelled less obviously.
  --set and --unset are repeatable and merge over --body; --unset is applied
  last, so it wins on a key both mention.
  At least one of --body, --set or --unset is required.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const metadata: Record<string, unknown> = { ...base };

        for (const pair of (opts.set as string[] | undefined) ?? []) {
          const eq = pair.indexOf("=");
          if (eq === -1) {
            throw new Error(`--set expects key=value (got '${pair}')`);
          }
          const key = pair.slice(0, eq);
          const rawValue = pair.slice(eq + 1);
          if (!key) throw new Error(`--set key must not be empty (got '${pair}')`);
          let parsed: unknown = rawValue;
          try {
            parsed = JSON.parse(rawValue);
          } catch {
            // Leave as a plain string when the value isn't valid JSON.
          }
          metadata[key] = parsed;
        }

        for (const key of (opts.unset as string[] | undefined) ?? []) {
          metadata[key] = null;
        }

        if (Object.keys(metadata).length === 0) {
          throw new Error("Provide a metadata patch via --body, --set, or --unset");
        }

        const conv = await client.conversations.updateMetadata(id, { metadata });
        printRecord(conv.metadata ?? {});
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
