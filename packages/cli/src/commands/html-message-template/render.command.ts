import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { resolveBody } from "../../util/body";

/**
 * `nexus html-template render`
 *
 * NOT bound to a contract — the route is not one the v1 contract declares. See
 * the note beside the registration calls in `commands/html-message-template.ts`.
 */
export function registerHtmlMessageTemplateRenderCommand(tpl: Command, program: Command): void {
  tpl
    .command("render")
    .description("Render a template with provided data (returns sanitized HTML)")
    .argument("<id>", "Template ID")
    .option("--data <json>", "Data object as JSON, .json file, or '-' for stdin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus html-template render 22222222-2222-4222-8222-222222222222 --data '{"user":{"name":"Ada"}}'

Notes:
  RENDER RUNS NO MODEL AND COSTS NOTHING. It substitutes the data you hand it,
  nothing more — "html-template fill" is the one that calls an agent and bills.
  A MISSING KEY RENDERS AS EMPTY, NOT AS AN ERROR. Omit --data entirely, or leave
  one placeholder out of it, and Handlebars resolves it to an empty string: the
  call answers 200 with '<div>Hi </div>' and nothing reports the gap. Diff the
  output against the template's placeholders rather than trusting the 200.
  The keys must match the placeholder PATHS in htmlContent — {{user.name}} needs
  {"user":{"name":"..."}}, not {"name":"..."}. Read the source with
  "nexus html-template get <id>".`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const data = opts.data ? await resolveBody(opts.data) : {};
        const result = await client.htmlMessageTemplates.render(id, { data });
        printRecord(result, [{ key: "html", label: "HTML" }]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
