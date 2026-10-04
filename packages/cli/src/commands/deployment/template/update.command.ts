import type { UpdateDeploymentTemplateBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printRecord, printSuccess } from "../../../output";
import { asRequestBody } from "../../../util/body";
import { buildTemplateUpdateBody } from "../_shared/build-template-update-body";
import { TEMPLATE_UPDATE_NOTES } from "../copy/template-update-notes";

/** `nexus deployment template update` */
export function registerDeploymentTemplateUpdateCommand(
  depTemplate: Command,
  program: Command
): void {
  depTemplate
    .command("update")
    .description("Update a template's configuration on a deployment")
    .argument("<deploymentId>", "Deployment ID")
    .argument("<templateId>", "Template ID (Twilio SID)")
    .option("--name <name>", "New display name")
    .option("--description <text>", "New description")
    .option("--variables <json>", "Updated variables JSON")
    .option("--enable-multi-language", "Enable multi-language support")
    .option("--no-multi-language", "Disable multi-language support")
    .option(
      "--template-group <json>",
      "Template group JSON mapping languages to template IDs (standard templates)"
    )
    .option("--enable-dynamic-size", "Enable dynamic carousel size (carousel only)")
    .option("--no-dynamic-size", "Disable dynamic carousel size")
    .option(
      "--carousel-template-group <json>",
      "Carousel template group JSON with size variants (carousel only)"
    )
    .option(
      "--single-item-card-template-id <id>",
      "Fallback card template ID for single-item carousels"
    )
    .option(
      "--single-item-card-template-group <json>",
      "Single-item card template group JSON for multi-language fallback"
    )
    .addHelpText("after", TEMPLATE_UPDATE_NOTES)
    .action(async (deploymentId: string, templateId: string, opts) => {
      try {
        const body = buildTemplateUpdateBody(opts);
        if (body === undefined) return;

        const client = createClient(program.optsWithGlobals());
        const result = await client.deployments.updateDeploymentTemplate(
          deploymentId,
          templateId,
          asRequestBody<UpdateDeploymentTemplateBody>(body)
        );
        const data = result;
        printRecord(data, [
          { key: "templateId", label: "Template ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" }
        ]);
        printSuccess("Deployment template updated.");
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
