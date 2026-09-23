import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { SKILLS_DELETE_EXTERNAL_TOOL_CONTRACT } from "../external-tool.contract.generated";
import {
  extractToolHasAttachmentsDetails,
  reportToolHasAttachments
} from "./has-attachments.report";

const DELETE_HELP = `
By default this refuses to delete if any agent tool config references the
tool — the error lists up to 10 references plus the remaining count. Re-run
with --force to cascade-delete the references along with the tool.

Examples:
  $ nexus external-tool delete 11111111-1111-4111-8111-111111111111
  $ nexus external-tool delete 11111111-1111-4111-8111-111111111111 --force

Notes:
  THERE IS NO CONFIRMATION PROMPT AND NO --yes FLAG, on a TTY or anywhere else.
  The reference guard is the only thing standing between the command and the
  deletion, so on an UNREFERENCED tool this deletes on the first invocation —
  and --force removes that guard as well.
  Answers with {id} and nothing else. There is no "deleted" field to assert on,
  so a 200 IS the confirmation; verify with "nexus external-tool list".`;

/** `nexus external-tool delete` */
export function registerExternalToolDeleteCommand(
  externalTool: Command,
  program: Command
): Command {
  const leaf = externalTool
    .command("delete")
    .description("Delete an external tool")
    .argument("<id>", "External tool ID")
    .option("--force", "Cascade-delete: also remove any agent tool configs referencing this tool")
    .addHelpText("after", DELETE_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.skills.deleteExternalTool(id, { force: !!opts.force });
        printSuccess("External tool deleted.", { id });
      } catch (err) {
        // Special-case the 409 from the "has attachments" guard so we can
        // print the sample list and the --force hint. Everything else
        // falls through to the generic error handler.
        const attachments = extractToolHasAttachmentsDetails(err);
        if (attachments) {
          process.exitCode = reportToolHasAttachments(attachments);
          return;
        }
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, SKILLS_DELETE_EXTERNAL_TOOL_CONTRACT);
  return leaf;
}
