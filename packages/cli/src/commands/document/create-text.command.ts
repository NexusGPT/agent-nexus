import type { CreateTextDocumentBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { parseMetadataPairs } from "../../util/metadata";
import { resolveInputValue } from "../../util/stdin";
import { collectMetadata } from "./collect-metadata";

const CREATE_TEXT_HELP = `
Examples:
  $ nexus document create-text --name "FAQ" --content "Q: How do I...\\nA: You can..."
  $ cat content.md | nexus document create-text --name "Guide" --content -
  $ nexus document create-text --name "FAQ" --content - --metadata language=fr
  $ nexus document create-text --name "Guide" --content ./body.txt
  $ nexus document create-text --body '{"name":"FAQ","content":"..."}'

Notes:
  THIS IS THE RELIABLE WAY TO GET AWKWARD CONTENT IN. A page that a crawl cannot
  read, a PDF that extracts badly, a spreadsheet you would rather summarise —
  paste the text here instead of fighting the importer.

  Indexed asynchronously like every other document: poll "nexus document get
  <id>" for READY.

  --content takes literal text, A FILE PATH, or '-' for stdin, and there is an
  example of each above. A path is DETECTED, never declared: a value naming a
  readable file stores that file's contents, trimmed of leading and trailing
  whitespace. A path that does not resolve — a typo, a permission error, a
  directory — is stored as LITERAL TEXT with no error, so a document whose whole
  content is "./body.txt" means the file was not readable from here.
  Escape sequences
  in a shell string are passed through literally — pipe a file when the content
  has real newlines in it.`;

/** `nexus document create-text` */
export function registerDocumentCreateTextCommand(document: Command, program: Command): Command {
  const leaf = document
    .command("create-text")
    .description("Create a text document")
    .requiredOption("--name <name>", "Document name")
    .requiredOption("--content <text-or-->", "Content (text, or '-' for stdin)")
    .option("--description <text>", "Document description")
    .option("--metadata <key=value...>", "Filterable metadata (repeatable).", collectMetadata, [])
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", CREATE_TEXT_HELP)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.content) flags.content = await resolveInputValue(opts.content);
        if (opts.description !== undefined) flags.description = opts.description;
        const metadataFlags = opts.metadata as string[];
        if (metadataFlags.length > 0) flags.metadata = parseMetadataPairs(metadataFlags);

        const body = mergeBodyWithFlags(base, flags);

        const doc = await client.documents.createText(asRequestBody<CreateTextDocumentBody>(body));
        printSuccess("Text document created.", {
          id: doc.id,
          name: doc.name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
