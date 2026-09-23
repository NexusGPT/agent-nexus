import { color } from "../../output";
import type { CreateApprovalOutcome } from "./template-create.await-verdict";

/**
 * Narrate what `create --submit`'s poll saw, on the human channel only.
 *
 * The caller owns the `isJsonMode()` guard and the exit code; this says what
 * happened and nothing else. A timeout gets a pointer at `approvals` rather than
 * a failure, because it is not one — see `template-create.await-verdict.ts`.
 */
export function renderCreateApprovalVerdict(outcome: CreateApprovalOutcome): void {
  if (!outcome.decided) {
    console.log(
      `Status still pending. Check later: ${color.dim("nexus channel whatsapp-template approvals")}`
    );
    return;
  }

  if (outcome.status === "rejected") {
    console.log(color.red(`✗ Template rejected by Meta: ${outcome.status}`));
    if (outcome.rejectionReason) console.log(`  Reason: ${outcome.rejectionReason}`);
    return;
  }

  console.log(color.green(`✓ Template approved by Meta.`));
}
