import type { CreateDocumentFolderBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";

const CREATE_FOLDER_HELP = `
Examples:
  $ nexus document create-folder --name "Reports"
  $ nexus document create-folder --name "Q4" --parent-id 22222222-2222-4222-8222-222222222222

Notes:
  A FOLDER IS A DOCUMENT WITH NO CONTENT. It organizes the knowledge base and
  nothing else. It carries no text, so it retrieves nothing itself;
  "collection attach-documents" expands a folder id to the documents inside it
  (recursively) at attach time.

  add-website, create-google-sheet and create-folder all produce a FOLDER whose
  pages, tabs or files are its children. Only create-folder makes an empty one
  for you to fill.

  --parent-id must name a folder in YOUR organization; anything else is a 404,
  not a fallback to the root. Omit it to create at the root.

  Nesting is allowed: a folder can hold folders.`;

/** `nexus document create-folder` */
export function registerDocumentCreateFolderCommand(document: Command, program: Command): Command {
  const leaf = document
    .command("create-folder")
    .description("Create a document folder")
    .requiredOption("--name <name>", "Folder name")
    .option("--parent-id <id>", "Parent folder document ID")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", CREATE_FOLDER_HELP)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = { name: opts.name };
        if (opts.parentId !== undefined) flags.parentId = opts.parentId;
        const body = mergeBodyWithFlags(base, flags);

        const folder = await client.documents.createFolder(
          asRequestBody<CreateDocumentFolderBody>(body)
        );
        printSuccess("Folder created.", {
          id: folder.id,
          name: folder.name ?? opts.name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  return leaf;
}
