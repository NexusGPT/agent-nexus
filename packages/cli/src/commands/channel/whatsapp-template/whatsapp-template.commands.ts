import type { Command } from "commander";

import { registerChannelWhatsappTemplateApprovalsCommand } from "./approvals.command";
import { registerChannelWhatsappTemplateCreateCommand } from "./create.command";
import { registerChannelWhatsappTemplateDeleteCommand } from "./delete.command";
import { registerChannelWhatsappTemplateGetCommand } from "./get.command";
import { registerChannelWhatsappTemplateListCommand } from "./list.command";
import { registerChannelWhatsappTemplateSubmitApprovalCommand } from "./submit-approval.command";
import { registerChannelWhatsappTemplateTestSendCommand } from "./test-send.command";

/** `nexus channel whatsapp-template …` — the template lifecycle sub-group. */
export function registerChannelWhatsappTemplateCommands(channel: Command, program: Command): void {
  const waTemplate = channel
    .command("whatsapp-template")
    .description("Manage WhatsApp message templates (Twilio Content API)");

  waTemplate.addHelpText(
    "after",
    `
A template goes through four states and each one is a different command:
  create           written to Twilio, unsubmitted — cannot be sent
  submit-approval  filed with Meta, pending — still cannot be sent
  approvals        read the verdict: approved, pending or rejected
  test-send        SENDS A REAL BILLED MESSAGE to a real phone

Templates live on the CONNECTION, not on a deployment. Attach an approved one
to a deployment with "nexus deployment template attach" before an agent can
use it.

Meta's review is not instant and not guaranteed. Nothing here polls to
completion — "create --submit" and "submit-approval --wait" give up after 30s
and 2m and tell you to check "approvals".`
  );

  registerChannelWhatsappTemplateListCommand(waTemplate, program);
  registerChannelWhatsappTemplateGetCommand(waTemplate, program);
  registerChannelWhatsappTemplateCreateCommand(waTemplate, program);
  registerChannelWhatsappTemplateDeleteCommand(waTemplate, program);
  registerChannelWhatsappTemplateApprovalsCommand(waTemplate, program);
  registerChannelWhatsappTemplateSubmitApprovalCommand(waTemplate, program);
  registerChannelWhatsappTemplateTestSendCommand(waTemplate, program);
}
