import type { CreateDocumentTemplateFolderBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";

/** `nexus template folder create` */
export function registerTemplateFolderCreateCommand(tplFolder: Command, program: Command): void {
  tplFolder
    .command("create")
    .description("Create a document template folder")
    .requiredOption("--name <name>", "Folder name")
    .option("--parent-id <id>", "Parent folder ID")
    .option("--body <json>", "Request body as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template folder create --name "Contracts"
  $ nexus template folder create --name "2026" --parent-id 22222222-2222-4222-8222-222222222222

Notes:
  Creating a folder does not put anything in it. Use
  "nexus template folder assign" to move a template into it.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          ...(opts.parentId !== undefined && { parentId: opts.parentId })
        });
        const folder = await client.documentTemplateFolders.create(
          asRequestBody<CreateDocumentTemplateFolderBody>(body)
        );
        printSuccess("Template folder created.", { id: folder.id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
