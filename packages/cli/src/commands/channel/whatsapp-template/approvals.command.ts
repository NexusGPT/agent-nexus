import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printTable } from "../../../output";
import { type TemplateApprovalRow } from "../template-approval.read-verdict";

/** `nexus channel whatsapp-template approvals` */
export function registerChannelWhatsappTemplateApprovalsCommand(
  waTemplate: Command,
  program: Command
): void {
  waTemplate
    .command("approvals")
    .description("List template approval status from Meta")
    .option("--connection-id <id>", "Filter by messaging connection ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel whatsapp-template approvals
  $ nexus channel whatsapp-template approvals --json

Notes:
  THIS IS THE AUTHORITATIVE ANSWER to "can this template be sent". approved is
  the only status that can; pending and unsubmitted cannot, and rejected never
  will until the template is rewritten and resubmitted.
  A template that was never submitted may carry an EMPTY status rather than
  "unsubmitted" — a blank STATUS column is not approval.
  REJECTION REASON is Meta's own text and is the only thing that says what to
  change. Read it before resubmitting anything.
  Omitting --connection-id lists across every connection; an organization has
  one, so it rarely matters.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.listTemplateApprovals({
          connectionId: opts.connectionId
        });
        const data = result;
        const items = Array.isArray(data) ? data : [data];

        // Flatten approvalRequests for table display
        const rows = items.map((item: TemplateApprovalRow) => ({
          sid: item.sid,
          name: item.approvalRequests?.name ?? "",
          category: item.approvalRequests?.category ?? "",
          status: item.approvalRequests?.status ?? "",
          rejection_reason: item.approvalRequests?.rejection_reason ?? ""
        }));

        printTable(rows, [
          { key: "sid", label: "SID", width: 38 },
          { key: "name", label: "NAME", width: 20 },
          { key: "category", label: "CATEGORY", width: 15 },
          { key: "status", label: "STATUS", width: 12 },
          { key: "rejection_reason", label: "REJECTION REASON", width: 30 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
