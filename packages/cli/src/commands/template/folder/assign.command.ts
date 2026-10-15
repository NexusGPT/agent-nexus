import type { AssignTemplateToFolderBody } from "@agent-nexus/sdk";
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

/** `nexus template folder assign` */
export function registerTemplateFolderAssignCommand(tplFolder: Command, program: Command): void {
  tplFolder
    .command("assign")
    .description("Assign a template to a folder")
    .requiredOption("--template-id <id>", "Template ID")
    .requiredOption("--folder-id <id>", "Folder ID (use 'null' to unassign)")
    .option("--body <json>", "Request body as JSON")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template folder assign --template-id 11111111-1111-4111-8111-111111111111 --folder-id 33333333-3333-4333-8333-333333333333
  $ nexus template folder assign --template-id 11111111-1111-4111-8111-111111111111 --folder-id null

Notes:
  THIS IS A MOVE, NOT AN ADD. A template sits in at most ONE folder, so
  assigning it here takes it out of whichever folder held it before. Nothing in
  the response names the folder it left.

  --folder-id null UNASSIGNS the template, leaving it outside every folder. It
  is still fully usable there — a template's folder affects nothing but where it
  appears in the dashboard.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          templateId: opts.templateId,
          folderId: readClearableFlag(opts.folderId)
        });
        await client.documentTemplateFolders.assign(
          asRequestBody<AssignTemplateToFolderBody>(body)
        );
        printSuccess("Template assigned to folder.", {
          templateId: opts.templateId,
          folderId: opts.folderId
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
