import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printTable } from "../../../output";

/** `nexus deployment template list` */
export function registerDeploymentTemplateListCommand(
  depTemplate: Command,
  program: Command
): void {
  depTemplate
    .command("list")
    .description("List templates attached to a WhatsApp deployment")
    .argument("<deploymentId>", "Deployment ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus deployment template list 11111111-1111-4111-8111-111111111111
  $ nexus deployment template list 11111111-1111-4111-8111-111111111111 --json

Notes:
  Lists what is ATTACHED here, not what exists in Twilio — a template can be
  approved and absent from this list. "nexus channel whatsapp-template list"
  is the Twilio-side inventory.
  Says nothing about Meta approval. Read that from
  "nexus channel whatsapp-template approvals".`
    )
    .action(async (deploymentId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.deployments.listDeploymentTemplates(deploymentId);
        const data = result;
        const items = Array.isArray(data) ? data : [data];
        const rows = items.map((t) => ({
          templateId: t.templateId,
          name: t.name,
          type: t.type ?? "template",
          variables: Object.keys(t.variables ?? {}).length,
          multiLang: t.enableMultiLanguage ? "yes" : "no"
        }));
        printTable(rows, [
          { key: "templateId", label: "TEMPLATE ID", width: 38 },
          { key: "name", label: "NAME", width: 20 },
          { key: "type", label: "TYPE", width: 10 },
          { key: "variables", label: "VARS", width: 6 },
          { key: "multiLang", label: "MULTI-LANG", width: 10 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
