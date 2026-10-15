import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";

/** `nexus template folder delete` */
export function registerTemplateFolderDeleteCommand(tplFolder: Command, program: Command): void {
  confirmable(tplFolder.command("delete"))
    .description("Delete a document template folder")
    .argument("<id>", "Folder ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template folder delete 22222222-2222-4222-8222-222222222222
  $ nexus template folder delete 22222222-2222-4222-8222-222222222222 --yes

Notes:
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (!(await confirmDestructive(`Delete template folder ${id}?`, opts))) return;
        await client.documentTemplateFolders.delete(id);
        printSuccess("Template folder deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
