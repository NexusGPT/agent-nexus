import type { UpdateDocumentBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess, printWarning } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { parseMetadataPairs } from "../../util/metadata";
import { collectMetadata } from "./collect-metadata";

const UPDATE_HELP = `
Examples:
  $ nexus document update 11111111-1111-4111-8111-111111111111 --name "Updated Report"
  $ nexus document update 11111111-1111-4111-8111-111111111111 --metadata language=fr
  $ nexus document update 11111111-1111-4111-8111-111111111111 --body '{"description":"Q4 report"}'

Notes:
  METADATA CHANGES DO NOT REACH SEARCH UNTIL YOU REPROCESS. This writes the
  database column only; "collection query --filter" keeps matching the OLD
  values until "nexus document reprocess <id>" runs. The command prints a
  reminder when you pass --metadata.

  --metadata REPLACES THE WHOLE METADATA BAG, IT DOES NOT MERGE. Every key you
  do not repeat in this call is dropped, and nothing in the response says so.
  Read the current bag first — it is the "metadata" key of
  "nexus document get <id> --json" — then repeat every key it holds as its own
  --metadata flag alongside the one you are changing.

  This changes the document's labels, never its CONTENT. Replacing the text
  means uploading a new document, or reprocessing the source.`;

/**
 * `nexus document update`
 *
 * UNBOUND ON PURPOSE — see the docblock on `registerDocumentCommands`.
 */
export function registerDocumentUpdateCommand(document: Command, program: Command): Command {
  const leaf = document
    .command("update")
    .description("Update document metadata")
    .argument("<id>", "Document ID")
    .option("--name <name>", "Document name")
    .option("--description <text>", "Document description")
    .option(
      "--metadata <key=value...>",
      "Filterable metadata (repeatable). Re-run 'document reprocess' to re-index it.",
      collectMetadata,
      []
    )
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", UPDATE_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.description !== undefined) flags.description = opts.description;
        const metadataFlags = opts.metadata as string[];
        if (metadataFlags.length > 0) flags.metadata = parseMetadataPairs(metadataFlags);
        const body = mergeBodyWithFlags(base, flags);

        const doc = await client.documents.update(id, asRequestBody<UpdateDocumentBody>(body));
        printSuccess("Document updated.", { id: doc.id ?? id });
        // A metadata edit only writes the DB column; the retrieval index stays
        // stale until the document is reprocessed. Nudge the user so the change is
        // not silently invisible to search/retrieval.
        if (metadataFlags.length > 0) {
          printWarning(
            "Metadata changed but not yet searchable.",
            `Run:  nexus document reprocess ${id}`
          );
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
