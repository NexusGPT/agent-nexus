import type { Command } from "commander";

import { registerDeploymentTemplateAttachCommand } from "./attach.command";
import { registerDeploymentTemplateDetachCommand } from "./detach.command";
import { registerDeploymentTemplateListCommand } from "./list.command";
import { registerDeploymentTemplateSettingsCommand } from "./settings.command";
import { registerDeploymentTemplateUpdateCommand } from "./update.command";

/** `nexus deployment template …` — WhatsApp deployments only. */
export function registerDeploymentTemplateCommands(deployment: Command, program: Command): void {
  const depTemplate = deployment
    .command("template")
    .description("Manage WhatsApp templates attached to a deployment");

  depTemplate.addHelpText(
    "after",
    `
WHATSAPP DEPLOYMENTS ONLY. All five commands here refuse anything else with
"Templates can only be managed on WhatsApp deployments" — including the reads,
so a 400 from "template list" means you named the wrong deployment.

These wire an EXISTING Twilio template to a deployment. Nothing here creates a
template or asks Meta for anything — build and submit it with
"nexus channel whatsapp-template create --submit", wait for approval, then
attach the SID here. An unapproved template attaches without complaint and
fails when the agent tries to send it.

Attaching is what makes a template reachable by the agent on this deployment.`
  );

  registerDeploymentTemplateListCommand(depTemplate, program);
  registerDeploymentTemplateAttachCommand(depTemplate, program);
  registerDeploymentTemplateUpdateCommand(depTemplate, program);
  registerDeploymentTemplateDetachCommand(depTemplate, program);
  registerDeploymentTemplateSettingsCommand(depTemplate, program);
}
