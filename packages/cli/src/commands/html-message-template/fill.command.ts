import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/**
 * `nexus html-template fill`
 *
 * NOT bound to a contract — the route is not one the v1 contract declares. See
 * the note beside the registration calls in `commands/html-message-template.ts`.
 */
export function registerHtmlMessageTemplateFillCommand(tpl: Command, program: Command): void {
  tpl
    .command("fill")
    .description("Let the agent fill the template's input schema from context, then render")
    .argument("<id>", "Template ID")
    .requiredOption("--context <text>", "Natural-language context for the agent")
    .option("--model <model>", "Model override")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus html-template fill 22222222-2222-4222-8222-222222222222 --context "Order #42 for Ada, 2 items shipped today"

Notes:
  THIS CALLS A MODEL AND IS BILLED. "html-template render" is the free path when
  you already hold the data.
  A TEMPLATE WITH NO handler "prompt" ENTRY IS NOT FILLED AND DOES NOT ERROR. The
  model call is skipped, the template renders with no data, and you get blank
  placeholders back at 200 for free. Check inputSchema with
  "nexus html-template get <id> --json" when the card comes back empty.
  --context is the ONLY thing the agent is told, beyond the template's name and
  description. It gets no conversation and no customer record, so put every
  value the card needs into that string.
  The returned "data" is what the model produced — read it to see which fields
  it actually filled, rather than inferring from the HTML.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.htmlMessageTemplates.fill(id, {
          context: opts.context,
          model: opts.model
        });
        printRecord({ html: result.html, data: JSON.stringify(result.data, null, 2) }, [
          { key: "html", label: "HTML" },
          { key: "data", label: "Data" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
