import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";

/** `nexus deployment folder delete` */
export function registerDeploymentFolderDeleteCommand(depFolder: Command, program: Command): void {
  confirmable(depFolder.command("delete"))
    .description("Delete a deployment folder")
    .argument("<id>", "Folder ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment folder delete 55555555-5555-4555-8555-555555555555
  $ nexus deployment folder delete 55555555-5555-4555-8555-555555555555 --yes

Notes:
  UNFILES, DOES NOT DELETE. Every deployment in this folder survives and
  keeps serving; it simply belongs to no folder afterwards, and nothing
  reports which ones moved. Run "nexus api GET /deployment-folders" first if
  you need that list.
  Child folders are NOT deleted: they lose their parent and reappear at the
  top level, keeping the deployments filed in them.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete deployment folder ${id}?`, opts))) return;

        await client.deploymentFolders.delete(id);
        printSuccess("Deployment folder deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
