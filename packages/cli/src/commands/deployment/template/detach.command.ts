import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";

/** `nexus deployment template detach` */
export function registerDeploymentTemplateDetachCommand(
  depTemplate: Command,
  program: Command
): void {
  confirmable(depTemplate.command("detach"))
    .description("Detach a template from a deployment")
    .argument("<deploymentId>", "Deployment ID")
    .argument("<templateId>", "Template ID (Twilio SID)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment template detach 11111111-1111-4111-8111-111111111111 HX456
  $ nexus deployment template detach 11111111-1111-4111-8111-111111111111 HX456 --yes

Notes:
  THE TEMPLATE ITSELF IS NOT DELETED. This unwires it from this deployment
  only; it stays in Twilio, stays approved, and stays attached to any other
  deployment using it. "nexus channel whatsapp-template delete" is the one
  that removes it for good.
  The agent stops being able to send it here immediately.
  Detaching a template that is not attached is a 404.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (deploymentId: string, templateId: string, opts) => {
      try {
        if (
          !(await confirmDestructive(
            `Detach template ${templateId} from deployment ${deploymentId}?`,
            opts
          ))
        )
          return;
        const client = createClient(program.optsWithGlobals());
        await client.deployments.detachDeploymentTemplate(deploymentId, templateId);
        printSuccess("Template detached from deployment.", { templateId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
