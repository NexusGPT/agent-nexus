import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { absent, printSuccess } from "../../../output";
import { readClearableFlag } from "../../../util/body";

/** `nexus deployment folder assign` */
export function registerDeploymentFolderAssignCommand(depFolder: Command, program: Command): void {
  depFolder
    .command("assign")
    .description("File a deployment in a folder — THIS MOVES IT out of its current one")
    .requiredOption("--deployment-id <id>", "Deployment ID")
    .requiredOption("--folder-id <id>", "Folder ID, or 'null' to unfile the deployment")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment folder assign --deployment-id 11111111-1111-4111-8111-111111111111 --folder-id 66666666-6666-4666-8666-666666666666
  $ nexus deployment folder assign --deployment-id 11111111-1111-4111-8111-111111111111 --folder-id null

Notes:
  THIS IS A MOVE, NOT AN ADD. A deployment belongs to exactly ONE folder, so
  this takes it out of whichever folder held it. Nothing in the response names
  the folder it left.
  --folder-id null unfiles it: the assignment row is deleted and the response
  reports assigned=false. Re-running the same assign is idempotent.
  Both ids must be visible to this key or it is a 404 — for a member key that
  includes a folder somebody else created.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // "null" is the token this CLI already uses for a wire null on
        // `deployment update`. The route's body types folderId as
        // `uuid | null` and treats null as an unassignment, but a required
        // string flag has no other way to say it — without this the only
        // documented way out of a folder is unreachable from the CLI.
        const folderId = readClearableFlag(opts.folderId);
        await client.deploymentFolders.assign({
          deploymentId: opts.deploymentId,
          folderId
        });
        printSuccess(folderId === null ? "Deployment unfiled." : "Deployment assigned to folder.", {
          deploymentId: opts.deploymentId,
          folderId: folderId ?? absent("(none)")
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
