import type { CreateDeploymentFolderBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../../util/body";

/** `nexus deployment folder create` */
export function registerDeploymentFolderCreateCommand(depFolder: Command, program: Command): void {
  depFolder
    .command("create")
    .description("Create a deployment folder")
    .requiredOption("--name <name>", "Folder name")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment folder create --name "Production"
  $ nexus deployment folder create --body '{"name":"Staging"}'
  $ nexus deployment folder create --body '{"name":"EU","parentId":"55555555-5555-4555-8555-555555555555"}'

Notes:
  Names are not unique — two "Production" folders can exist side by side and
  nothing warns. Check "folder list" first if you are scripting this.
  Nesting is only expressible through --body parentId; there is no flag.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name })
        });
        const folder = await client.deploymentFolders.create(
          asRequestBody<CreateDeploymentFolderBody>(body)
        );
        printSuccess("Deployment folder created.", {
          id: folder.id,
          name: folder.name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
