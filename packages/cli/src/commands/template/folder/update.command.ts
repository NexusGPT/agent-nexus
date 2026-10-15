import type { UpdateDocumentTemplateFolderBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import {
  asRequestBody,
  mergeBodyWithFlags,
  readClearableFlag,
  resolveBody
} from "../../../util/body";

/** `nexus template folder update` */
export function registerTemplateFolderUpdateCommand(tplFolder: Command, program: Command): void {
  tplFolder
    .command("update")
    .description("Update a document template folder")
    .argument("<id>", "Folder ID")
    .option("--name <name>", "Folder name")
    .option("--parent-id <id>", "Parent folder ID (use 'null' for root)")
    .option("--body <json>", "Request body as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template folder update 22222222-2222-4222-8222-222222222222 --name "Contracts"
  $ nexus template folder update 22222222-2222-4222-8222-222222222222 --parent-id null

Notes:
  --parent-id null MOVES THE FOLDER TO THE ROOT. The literal string "null" is
  translated to a real null; there is no other way to clear a parent.

  Only the fields you send are written. Moving a folder moves the templates
  inside it, since they are addressed through it.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.parentId !== undefined) {
          flags.parentId = readClearableFlag(opts.parentId);
        }
        const body = mergeBodyWithFlags(base, flags);
        await client.documentTemplateFolders.update(
          id,
          asRequestBody<UpdateDocumentTemplateFolderBody>(body)
        );
        printSuccess("Template folder updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
