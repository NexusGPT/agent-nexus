import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";

/** `nexus template delete` */
export function registerTemplateDeleteCommand(template: Command, program: Command): void {
  confirmable(template.command("delete"))
    .description("Delete a document template")
    .argument("<id>", "Template ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus template delete 11111111-1111-4111-8111-111111111111
  $ nexus template delete 11111111-1111-4111-8111-111111111111 --yes

Notes:
  Fails with 409 if anything still points at the template — an AI task whose
  output format is TEMPLATE, an agent task, or an agent carrying it as a skill.
  The error lists the dependents; detach them (or delete them) and retry.

  DETACHING NEEDS SCOPES THIS COMMAND DOES NOT. Deleting is "skills:delete";
  removing an agent's skill is "agent_skills:delete". A key holding only
  "skills:delete" is handed a list of dependents it cannot act on and a 409 it
  cannot clear — mint the second scope before you start.

  WHAT GOES: the row, the uploaded file behind it, its folder filing and its
  saved embedding. WHAT STAYS: every document already generated from it. Those
  are storage objects with no database row, so nothing here can list or remove
  them — see "nexus template generate --help".

  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete document template ${id}?`, opts))) return;

        await client.skills.deleteDocumentTemplate(id);
        printSuccess("Document template deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
