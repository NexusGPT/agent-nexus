import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";

/** `nexus deployment duplicate` */
export function registerDeploymentDuplicateCommand(deployment: Command, program: Command): void {
  deployment
    .command("duplicate")
    .description("Duplicate a deployment — NOT SERVED, every call 404s")
    .argument("<id>", "Deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment duplicate 11111111-1111-4111-8111-111111111111

Notes:
  THIS COMMAND CANNOT SUCCEED. The Public API v1 serves no
  POST /deployments/:id/duplicate, so every invocation is a 404 whatever the
  id. "nexus agent duplicate" and "nexus workflow duplicate" do exist; the
  deployment equivalent does not.
  To copy one: read "nexus deployment get <id>", then create a new deployment
  with the same type and settings. A WhatsApp number cannot be copied — it is
  held by one deployment at a time.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        // `duplicate()` is typed `Promise<never>`, and that is correct rather
        // than a defect: the v1 contract declares no such route, so the call
        // cannot return a deployment to read fields off. The `as any` here used
        // to make two unreachable reads look like live code.
        await client.deployments.duplicate(id);
        printSuccess("Deployment duplicated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
