import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printSuccess } from "../../../output";
import { confirmable, confirmDestructive } from "../../../util/confirm";

/** `nexus channel whatsapp-template delete` */
export function registerChannelWhatsappTemplateDeleteCommand(
  waTemplate: Command,
  program: Command
): void {
  confirmable(waTemplate.command("delete"))
    .description("Delete a WhatsApp template — permanent, and Meta approval dies with it")
    .argument("<templateId>", "Template ID (Twilio SID)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-template delete HX123
  $ nexus channel whatsapp-template delete HX123 --yes

Notes:
  THE META APPROVAL GOES WITH IT AND CANNOT BE RECOVERED. Recreating the same
  text produces a new SID that starts unsubmitted and has to be reviewed
  again, which takes as long as the first time did.

  DEPLOYMENTS STILL HOLDING THIS TEMPLATE ARE NOT UPDATED. Their attachment
  keeps the dead SID, nothing errors here, and the agent's send fails later.
  Run "nexus deployment template list <depId>" across your WhatsApp
  deployments first and detach it from each.

  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`
    )
    .action(async (templateId, opts) => {
      try {
        if (!(await confirmDestructive(`Delete template ${templateId}?`, opts))) return;
        const client = createClient(program.optsWithGlobals());
        await client.channels.deleteWhatsAppTemplate(templateId);
        printSuccess("WhatsApp template deleted.", { id: templateId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
