import type { UpdateDeploymentFolderBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";

/** `nexus deployment folder update` */
export function registerDeploymentFolderUpdateCommand(depFolder: Command, program: Command): void {
  depFolder
    .command("update")
    .description("Update a deployment folder")
    .argument("<id>", "Folder ID")
    .option("--name <name>", "Folder name")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment folder update 55555555-5555-4555-8555-555555555555 --name "Renamed"
  $ nexus deployment folder update 55555555-5555-4555-8555-555555555555 --body '{"name":"Renamed"}'
  $ nexus deployment folder update 55555555-5555-4555-8555-555555555555 --body '{"parentId":null}'

Notes:
  Renaming and re-parenting only — the deployments filed here are untouched.
  --body '{"parentId":null}' lifts the folder back to the top level;
  a parentId string moves it under that folder. No flag covers either.
  A folder an org-member key cannot see is a 404, not a 403.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name })
        });
        await client.deploymentFolders.update(id, asRequestBody<UpdateDeploymentFolderBody>(body));
        printSuccess("Deployment folder updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
