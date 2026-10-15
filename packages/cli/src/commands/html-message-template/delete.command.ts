import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";

/**
 * `nexus html-template delete`
 *
 * NOT bound to a contract — the route is not one the v1 contract declares. See
 * the note beside the registration calls in `commands/html-message-template.ts`.
 */
export function registerHtmlMessageTemplateDeleteCommand(tpl: Command, program: Command): void {
  confirmable(tpl.command("delete"))
    .description("Delete an HTML message template")
    .argument("<id>", "Template ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus html-template delete 22222222-2222-4222-8222-222222222222
  $ nexus html-template delete 22222222-2222-4222-8222-222222222222 --yes

Notes:
  IT TAKES A TOOL AWAY FROM THE AGENT. The deployment's agent advertises one
  "send_html_template_<name>" tool per template, and deleting this one stops that
  tool being advertised immediately. Any prompt or instruction that names it now
  names a tool that does not exist, and nothing in this command's output says the
  agent's capabilities just changed.
  THIS ONE REALLY DELETES — unlike "nexus template", which has no delete at all,
  and unlike "nexus workflow delete", which archives. The htmlContent and the
  inputSchema go with it and there is no undo, so read them back with
  "html-template get <id> --json" first if the source matters.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.
  It frees the name on that deployment for reuse.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (!(await confirmDestructive(`Delete HTML message template ${id}?`, opts))) return;
        await client.htmlMessageTemplates.delete(id);
        printSuccess("HTML message template deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
