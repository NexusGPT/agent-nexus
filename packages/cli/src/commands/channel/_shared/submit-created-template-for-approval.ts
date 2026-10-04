import type { NexusClient } from "@agent-nexus/sdk";

import { isJsonMode, printRecord, printSuccess } from "../../../output";
import { applyApprovalVerdictExitCode } from "../template-approval.exit-category";
import { awaitApprovalVerdictAfterCreate } from "../template-create.await-verdict";
import { createApprovalDocument } from "../template-create.document";
import { renderCreateApprovalVerdict } from "../template-create.verdict.render";
import { emitPartialThenRethrow } from "./emit-partial-then-rethrow";

/**
 * The approval category, taken FROM the SDK argument rather than retyped, so a
 * new category cannot make this signature quietly wrong.
 */
type SubmitApprovalCategory = Parameters<
  NexusClient["channels"]["submitTemplateApproval"]
>[0]["category"];

/**
 * The `--submit` branch of `nexus channel whatsapp-template create`, lifted out
 * of the action verbatim. The caller keeps the `if (opts.submit)` test, so the
 * control flow reads unchanged at the call site.
 */
export async function submitCreatedTemplateForApproval(
  client: NexusClient,
  opts: { connectionId: string; friendlyName: string; category: SubmitApprovalCategory },
  data: { id: string }
): Promise<Record<string, unknown> | undefined> {
  let approval: Record<string, unknown> | undefined;
  try {
    if (!isJsonMode()) {
      console.log("");
      console.log("Submitting for Meta approval...");
    }
    const approvalData = await client.channels.submitTemplateApproval({
      connectionId: opts.connectionId,
      templateId: data.id,
      name: opts.friendlyName,
      category: opts.category
    });
    if (!isJsonMode()) {
      printRecord(approvalData, [
        { key: "sid", label: "Approval SID" },
        { key: "status", label: "Status" }
      ]);
      printSuccess("Template submitted for Meta approval.");
      console.log("Checking approval status...");
    }

    const verdict = await awaitApprovalVerdictAfterCreate(
      () => client.channels.listTemplateApprovals({ connectionId: opts.connectionId }),
      data.id
    );
    if (!isJsonMode()) renderCreateApprovalVerdict(verdict);
    // ONE RULE, SHARED WITH `submit-approval --wait`, and it used to be
    // two: this site said `1` and its sibling said nothing at all, for
    // the identical answer from Meta. `template-approval.exit-category.ts`
    // owns the category and the reasoning for it.
    applyApprovalVerdictExitCode(verdict.status);

    approval = createApprovalDocument(approvalData, verdict);
  } catch (submitError) {
    // The template EXISTS. Say so, with its id, before the failure.
    emitPartialThenRethrow(data, "submit-approval", submitError);
  }
  return approval;
}
