import type { UpdateHtmlMessageTemplateBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";

/**
 * `nexus html-template update`
 *
 * NOT bound to a contract: this verb reaches a route the v1 contract does not
 * declare, so there is nothing for `bindCommand` to render. See the note beside
 * the registration calls in `commands/html-message-template.ts`.
 */
export function registerHtmlMessageTemplateUpdateCommand(tpl: Command, program: Command): void {
  tpl
    .command("update")
    .description("Update an HTML message template")
    .argument("<id>", "Template ID")
    .option("--name <name>", "Template name")
    .option("--description <text>", "Template description")
    .option("--html <html>", "Handlebars HTML source")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus html-template update 22222222-2222-4222-8222-222222222222 --name "Order card v2"
  $ nexus html-template update 22222222-2222-4222-8222-222222222222 --html '<div>Hi {{name}}, order {{orderId}}</div>'
  $ nexus html-template update 22222222-2222-4222-8222-222222222222 --body '{"inputSchema":{"name":{"type":"string","handler":"prompt"}}}'

Notes:
  THIS IS A PATCH AND IT PRESERVES WHAT IT DOES NOT NAME. Renaming with --name
  alone leaves htmlContent and inputSchema exactly as they were. That is the
  opposite of "nexus deployment update", whose settings object replaces
  wholesale — do not carry that habit here.
  AN EXPLICIT null ON inputSchema CLEARS IT, and clearing it means the agent can
  fill nothing: "html-template fill" then renders blank without calling a model.
  Omit the field to leave it alone; that is the difference between omitted and
  null on this route.
  CHANGING THE HTML DOES NOT CHANGE THE SCHEMA. Add a placeholder and its
  inputSchema entry in the same call, or the new placeholder renders empty
  forever.
  THE DEPLOYMENT CANNOT BE CHANGED. There is no deploymentId here; a template on
  the wrong deployment has to be created again and the old one deleted.
  An empty body is refused — send at least one field.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.name !== undefined) flags.name = opts.name;
        if (opts.description !== undefined) flags.description = opts.description;
        if (opts.html !== undefined) flags.htmlContent = opts.html;
        const body = mergeBodyWithFlags(base, flags);
        await client.htmlMessageTemplates.update(
          id,
          asRequestBody<UpdateHtmlMessageTemplateBody>(body)
        );
        printSuccess("HTML message template updated.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
