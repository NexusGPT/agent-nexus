import { Command } from "commander";

import { registerDeploymentCreateCommand } from "./deployment/create.command";
import { registerDeploymentDeleteCommand } from "./deployment/delete.command";
import { registerDeploymentDuplicateCommand } from "./deployment/duplicate.command";
import { registerDeploymentEmbedConfigCommand } from "./deployment/embed-config.command";
import { registerDeploymentEmbedConfigUpdateCommand } from "./deployment/embed-config-update.command";
import { registerDeploymentFolderCommands } from "./deployment/folder/folder.commands";
import { registerDeploymentGetCommand } from "./deployment/get.command";
import { registerDeploymentListCommand } from "./deployment/list.command";
import { registerDeploymentStatsCommand } from "./deployment/stats.command";
import { registerDeploymentTemplateCommands } from "./deployment/template/template.commands";
import { registerDeploymentUpdateCommand } from "./deployment/update.command";

export function registerDeploymentCommands(program: Command): void {
  const deployment = program
    .command("deployment")
    .description("Manage agent deployments — an agent bound to one channel");

  deployment.addHelpText(
    "after",
    `
A deployment is one agent on one channel. What else must exist first is
decided by the TYPE, so run "nexus channel setup --type <TYPE>" before
creating one.

Two facts decide whether a create works at all:
  • SETTINGS ARE VALIDATED AGAINST THE TYPE. EMBED, TELEGRAM, TWILIO_VOICE,
    GOOGLE_SHEETS and OUTLOOK_ADDIN reject a create that carries no settings
    and 400 listing every missing field. Every other type is created from
    name, type and agent-id alone.
  • WHATSAPP, TWILIO_SMS and TWILIO_VOICE also need an ACTIVE phone number
    this organization owns, and WHATSAPP needs a sender registered on it.

Reads need deployments:read, writes deployments:write, delete needs
deployments:delete.`
  );

  registerDeploymentListCommand(deployment, program);
  registerDeploymentGetCommand(deployment, program);
  registerDeploymentCreateCommand(deployment, program);
  registerDeploymentUpdateCommand(deployment, program);
  registerDeploymentDeleteCommand(deployment, program);
  registerDeploymentStatsCommand(deployment, program);
  registerDeploymentDuplicateCommand(deployment, program);
  registerDeploymentEmbedConfigCommand(deployment, program);
  registerDeploymentEmbedConfigUpdateCommand(deployment, program);

  registerDeploymentFolderCommands(deployment, program);
  registerDeploymentTemplateCommands(deployment, program);
}
