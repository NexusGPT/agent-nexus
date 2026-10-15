import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { HTML_MESSAGE_TEMPLATE_GET_CONTRACT } from "../html-template.contract.generated";

/** `nexus html-template get` */
export function registerHtmlMessageTemplateGetCommand(tpl: Command, program: Command): void {
  const get = tpl
    .command("get")
    .description("Get an HTML message template (includes Handlebars source)")
    .argument("<id>", "Template ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus html-template get 22222222-2222-4222-8222-222222222222
  $ nexus html-template get 22222222-2222-4222-8222-222222222222 --json

Notes:
  THE TABLE OMITS inputSchema — use --json for it. It is the only read that
  shows which placeholders the agent may fill, so check it before blaming
  "html-template fill" for a blank card.
  htmlContent is the raw Handlebars source, not rendered output. The placeholder
  paths in it are exactly the keys "html-template render --data" must supply.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const t = await client.htmlMessageTemplates.get(id);
        printRecord(t, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "deploymentId", label: "Deployment" },
          { key: "htmlContent", label: "HTML" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(get, HTML_MESSAGE_TEMPLATE_GET_CONTRACT);
}
