import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printRecord, printSuccess } from "../../../output";
import { DEPLOYMENT_WHATSAPP_TEMPLATE_ATTACH_CONTRACT } from "../../deployment.contract.generated";
import { parseTemplateAttachGroups } from "../_shared/parse-template-attach-groups";
import { TEMPLATE_ATTACH_NOTES } from "../copy/template-attach-notes";
import { addTemplateAttachOptions } from "./attach.options";

/** `nexus deployment template attach` */
export function registerDeploymentTemplateAttachCommand(
  depTemplate: Command,
  program: Command
): void {
  const templateAttach = addTemplateAttachOptions(
    depTemplate
      .command("attach")
      .description("Attach a WhatsApp template to a deployment")
      .argument("<deploymentId>", "Deployment ID")
  )
    .addHelpText("after", TEMPLATE_ATTACH_NOTES)
    .action(async (deploymentId: string, opts) => {
      try {
        const groups = parseTemplateAttachGroups(opts);
        if (groups === undefined) return;
        const { variables, templateGroup, carouselTemplateGroup, singleItemCardTemplateGroup } =
          groups;

        const client = createClient(program.optsWithGlobals());
        const result = await client.deployments.attachDeploymentTemplate(deploymentId, {
          templateId: opts.templateId,
          name: opts.name,
          description: opts.description,
          variables,
          type: opts.type,
          enableMultiLanguage: opts.enableMultiLanguage,
          templateGroup,
          enableDynamicSize: opts.enableDynamicSize,
          carouselTemplateGroup,
          singleItemCardTemplateId: opts.singleItemCardTemplateId,
          singleItemCardTemplateGroup
        });
        const data = result;
        printRecord(data, [
          { key: "templateId", label: "Template ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "type", label: "Type" }
        ]);
        printSuccess("Template attached to deployment.");
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Its one enum, `Body.type`, is on `--type` above, so this needs no bodyOnly
  // exemption. What the binding adds beyond the enum is the 28-field shape: the
  // three nested template-group objects reach the operator only as `--*-group
  // <json>`, and `--print-contract` is now the only place their keys are
  // written down.
  bindCommand(templateAttach, DEPLOYMENT_WHATSAPP_TEMPLATE_ATTACH_CONTRACT);
}
