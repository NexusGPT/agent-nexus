import type { CreateHtmlMessageTemplateBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { HTML_MESSAGE_TEMPLATE_CREATE_CONTRACT } from "../html-template.contract.generated";

/** `nexus html-template create` */
export function registerHtmlMessageTemplateCreateCommand(tpl: Command, program: Command): void {
  const create = tpl
    .command("create")
    .description("Create an HTML message template")
    .option("--name <name>", "Template name")
    .option("--description <text>", "Template description")
    .option("--html <html>", "Handlebars HTML source")
    .option("--deployment-id <id>", "EMBED deployment the template belongs to")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus html-template create --deployment-id 11111111-1111-4111-8111-111111111111 --name "Order card" --html '<div>Hi {{user.name}}</div>'
  $ nexus html-template create --body ./template.json

Notes:
  --deployment-id AND --html ARE BOTH REQUIRED by the API even though neither is
  a required option here; omitting either is a 400 naming the field, never a
  template with a default.
  THE DEPLOYMENT MUST BE AN EMBED ONE, AND A DEPLOYMENT OF THE WRONG TYPE READS
  AS A MISSING DEPLOYMENT. A real, live deployment that is WhatsApp or Slack
  answers "EMBED deployment <id> not found" — the same words a made-up id gets,
  so a 404 here sends you to check the id when the id was fine. Confirm the type
  first with "nexus deployment get <id>".
  NAMES ARE UNIQUE PER DEPLOYMENT. A second template with the same name on the
  same deployment is a 409, not a duplicate. The name is also load-bearing at run
  time: it becomes the agent's "send_html_template_<name>" tool.
  --description IS PROMPT TEXT, NOT A LABEL. The agent reads it to decide WHEN to
  send the card, and "html-template fill" passes it to the model alongside the
  name and nothing else. A blank description leaves the agent guessing from the
  name alone.
  inputSchema has no flag — send it inside --body. The namespace help above
  carries its shape and the handler rule that decides whether "fill" does
  anything.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const body = mergeBodyWithFlags(base, {
          name: opts.name,
          description: opts.description,
          htmlContent: opts.html,
          deploymentId: opts.deploymentId
        });
        const t = await client.htmlMessageTemplates.create(
          asRequestBody<CreateHtmlMessageTemplateBody>(body)
        );
        printSuccess("HTML message template created.", {
          id: t.id,
          name: t.name
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`.
  bindCommand(create, HTML_MESSAGE_TEMPLATE_CREATE_CONTRACT);
}
