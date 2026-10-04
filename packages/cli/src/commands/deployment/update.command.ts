import type { UpdateDeploymentBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, readClearableFlag, resolveBody } from "../../util/body";
import { booleanFlag } from "../../util/boolean-flag";
import { DEPLOYMENT_UPDATE_CONTRACT } from "../deployment.contract.generated";
import { UPDATE_NOTES } from "./copy/update-notes";

/** `nexus deployment update` */
export function registerDeploymentUpdateCommand(deployment: Command, program: Command): void {
  const update = deployment
    .command("update")
    .description("Update a deployment")
    .argument("<id>", "Deployment ID")
    .option("--name <name>", "Deployment name")
    .option("--description <text>", "Description (use 'null' to clear)")
    .option("--agent-id <id>", "Agent ID (use 'null' to detach)")
    .option("--active <bool>", "Set active status — true or false", booleanFlag)
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", UPDATE_NOTES)
    .action(async (id: string, opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.description !== undefined) {
          flags.description = readClearableFlag(opts.description);
        }
        if (opts.agentId !== undefined) {
          flags.agentId = readClearableFlag(opts.agentId);
        }
        if (opts.active !== undefined) {
          flags.isActive = opts.active;
        }
        const body = mergeBodyWithFlags(base, flags);

        await client.deployments.update(id, asRequestBody<UpdateDeploymentBody>(body));
        printSuccess("Deployment updated.", {
          id,
          dashboardUrl: dashboardUrlFor("deployment", id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists and after the hand-written prose, so
  // the generated reference lands below the Notes rather than above them.
  bindCommand(update, DEPLOYMENT_UPDATE_CONTRACT);
}
