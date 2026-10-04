import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { isJsonMode, printRecord, printSuccess } from "../../../output";
import {
  CHANNEL_WHATSAPP_TEMPLATE_APPROVAL_SUBMIT__BODY_CATEGORY,
  CHANNEL_WHATSAPP_TEMPLATE_APPROVAL_SUBMIT_CONTRACT
} from "../../channel.contract.generated";
import { awaitSubmitApprovalVerdict } from "../_shared/await-submit-approval-verdict";
import { printSubmitApprovalNextStep } from "../_shared/print-submit-approval-next-step";
import { TEMPLATE_SUBMIT_APPROVAL_NOTES } from "../copy/template-submit-approval-notes";
import { type SubmitApprovalOutcome } from "../template-submit-approval.await-verdict";
import { submitApprovalDocumentFields } from "../template-submit-approval.document";
/** `nexus channel whatsapp-template submit-approval` */
export function registerChannelWhatsappTemplateSubmitApprovalCommand(
  waTemplate: Command,
  program: Command
): void {
  const submitApproval = waTemplate
    .command("submit-approval")
    .description("Submit a template for Meta WhatsApp approval")
    .requiredOption("--connection-id <id>", "Messaging connection ID")
    .requiredOption("--template-id <id>", "Template ID (Twilio SID)")
    .requiredOption("--name <name>", "Template name for approval")
    .addOption(
      enumOption(
        "--category <category>",
        "Approval category",
        CHANNEL_WHATSAPP_TEMPLATE_APPROVAL_SUBMIT__BODY_CATEGORY
      ).makeOptionMandatory()
    )
    .option("--wait", "Poll approval status until resolved (up to 2 minutes)")
    .addHelpText("after", TEMPLATE_SUBMIT_APPROVAL_NOTES)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.submitTemplateApproval({
          connectionId: opts.connectionId,
          templateId: opts.templateId,
          name: opts.name,
          category: opts.category
        });
        const data = result;
        // ── ORDER, and it is the whole of this branch ──────────────────
        //
        // The human channel wants the submission acknowledged NOW and the poll
        // narrated as it happens. A script wants ONE document, and it wants the
        // status the poll ARRIVED at — the pre-poll one is the value `--wait`
        // exists to replace. Printing the record first served the human and gave
        // the script a stale document with a prose trailer stuck to it, which
        // `JSON.parse` refuses outright.
        if (!isJsonMode()) {
          printRecord(data, [
            { key: "sid", label: "Approval SID" },
            { key: "status", label: "Status" }
          ]);
          printSuccess("Template submitted for Meta approval.");
        }

        let verdict: SubmitApprovalOutcome | undefined;

        // Poll if --wait
        if (opts.wait) {
          verdict = await awaitSubmitApprovalVerdict(client, opts, data);
        }

        if (isJsonMode()) {
          printRecord({ ...data, ...submitApprovalDocumentFields(verdict, opts.wait === true) });
          return;
        }

        printSubmitApprovalNextStep(verdict);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(submitApproval, CHANNEL_WHATSAPP_TEMPLATE_APPROVAL_SUBMIT_CONTRACT);
}
