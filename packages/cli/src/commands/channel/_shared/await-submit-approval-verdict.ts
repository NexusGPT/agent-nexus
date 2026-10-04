import type { NexusClient } from "@agent-nexus/sdk";

import { isJsonMode } from "../../../output";
import { applyApprovalVerdictExitCode } from "../template-approval.exit-category";
import { isApprovalTerminal } from "../template-approval.read-verdict";
import {
  awaitApprovalVerdict,
  type SubmitApprovalOutcome
} from "../template-submit-approval.await-verdict";
import { renderSubmitApprovalVerdict } from "../template-submit-approval.verdict.render";
import { applyWaitExitCode } from "../template-wait.exit-category";
import { emitPartialThenRethrow } from "./emit-partial-then-rethrow";

/**
 * The `--wait` branch of `nexus channel whatsapp-template submit-approval`,
 * lifted out of the action verbatim. The caller keeps the `if (opts.wait)` test.
 */
export async function awaitSubmitApprovalVerdict(
  client: NexusClient,
  opts: { connectionId: string; templateId: string },
  data: { sid: string; status: string }
): Promise<SubmitApprovalOutcome | undefined> {
  let verdict: SubmitApprovalOutcome | undefined;
  try {
    if (!isJsonMode()) console.log("Waiting for approval...");

    verdict = await awaitApprovalVerdict(
      () => client.channels.listTemplateApprovals({ connectionId: opts.connectionId }),
      opts.templateId,
      data.status
    );

    if (!isJsonMode()) renderSubmitApprovalVerdict(verdict);
    // THE SAME CALL `create --submit` MAKES, DELIBERATELY IDENTICAL.
    // This branch used to render the rejection and exit 0, so which verb
    // filed the template decided whether a `set -e` script stopped.
    applyApprovalVerdictExitCode(verdict.status);
    // AND THE TIMEOUT, WHICH `create --submit` DOES NOT MAKE — this one
    // exited 0, which told a script Meta had approved.
    // `template-wait.exit-category.ts` owns why, and why `settled` is
    // read off the STATUS: it is the field the document derives `wait`
    // from, so the number and the record cannot disagree.
    applyWaitExitCode({ waited: true, settled: isApprovalTerminal(verdict.status) });
  } catch (pollError) {
    // The approval WAS submitted. Its sid must not die with the poll.
    emitPartialThenRethrow(data, "approval-poll", pollError);
  }
  return verdict;
}
