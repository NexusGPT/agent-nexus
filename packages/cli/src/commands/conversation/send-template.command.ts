import type { SendWhatsappTemplateBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, resolveRequiredBody } from "../../util/body";

/** `nexus conversation send-template` */
export function registerConversationSendTemplateCommand(
  conversation: Command,
  program: Command
): void {
  conversation
    .command("send-template")
    .description("Send a WhatsApp template to the customer — a real, billed message")
    .argument("<id>", "Conversation ID (UUID or nanoId)")
    .requiredOption("--body <json>", "Template JSON with { template, templateData }")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus conversation send-template 11111111-1111-4111-8111-111111111111 --body '{"template":{"id":"HX...","language":"en","types":{"twilio/text":{"body":"Hello {{1}}"}}},"templateData":{"1":"John"}}'

Notes:
  THIS DELIVERS TO THE REAL CUSTOMER AND BILLS. WhatsApp only; no draft, no
  recall. For a test send to a number you own, use
  "nexus channel whatsapp-template test-send".
  THE TEMPLATE MUST BE META-APPROVED. Check with
  "nexus channel whatsapp-template approvals" — an unapproved id is refused at
  send time, not by this command's validation.
  --body is required and carries the whole thing: template.id is the Twilio
  content SID (HX...), template.language its language code, template.types the
  content, and templateData fills the {{N}} placeholders by position.
  A missing position leaves the placeholder unfilled in what the customer
  receives.`
    )
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const body = await resolveRequiredBody(opts.body);
        const result = await client.conversations.sendWhatsappTemplate(
          id,
          asRequestBody<SendWhatsappTemplateBody>(body)
        );
        printSuccess("WhatsApp template sent.", result);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
