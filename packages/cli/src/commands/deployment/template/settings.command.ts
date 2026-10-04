import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { isJsonMode, printRecord, printSuccess } from "../../../output";
import { booleanFlag } from "../../../util/boolean-flag";

/** `nexus deployment template settings` */
export function registerDeploymentTemplateSettingsCommand(
  depTemplate: Command,
  program: Command
): void {
  depTemplate
    .command("settings")
    .description("View or update deployment template settings")
    .argument("<deploymentId>", "Deployment ID")
    .option(
      "--allow-dynamic-templates <bool>",
      "Allow agent to dynamically create and send templates — true or false",
      booleanFlag
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment template settings 11111111-1111-4111-8111-111111111111
  $ nexus deployment template settings 11111111-1111-4111-8111-111111111111 --allow-dynamic-templates true

Notes:
  WITHOUT THE FLAG THIS DOES NOT SHOW THE SETTING. It prints how many
  templates are attached — the current value of
  allowAgentToCreateAndSendTemplates is only readable from
  "nexus deployment get <id>" under settings.
  --allow-dynamic-templates true lets the agent author and send templates that
  were never reviewed here. Anything but the exact string "true" is read as
  false, including a typo, so it fails closed.`
    )
    .action(async (deploymentId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (opts.allowDynamicTemplates !== undefined) {
          const value = opts.allowDynamicTemplates;
          await client.deployments.updateDeploymentTemplateSettings(deploymentId, {
            allowAgentToCreateAndSendTemplates: value
          });
          printSuccess(
            `Dynamic template creation ${value ? "enabled" : "disabled"} for deployment.`
          );
        } else {
          // Show current settings by listing templates
          const result = await client.deployments.listDeploymentTemplates(deploymentId);
          const data = result;
          const attached = Array.isArray(data) ? data.length : 0;
          // A count and a tip, both as prose, were the whole of stdout — so the
          // one fact this branch produces was unreachable under --json. The
          // count is a field now; the tip is human copy and stays human.
          if (isJsonMode()) {
            printRecord({ deploymentId, templatesAttached: attached });
          } else {
            console.log(`Templates attached: ${attached}`);
            console.log(
              `Tip: Use --allow-dynamic-templates true/false to toggle agent template creation.`
            );
          }
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
