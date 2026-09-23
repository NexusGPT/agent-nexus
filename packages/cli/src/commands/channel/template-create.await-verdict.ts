import { pollForTerminalState } from "../../util/poll-for-terminal-state";
import {
  APPROVAL_POLL_AFTER_CREATE,
  isApprovalDecided,
  readApprovalVerdict
} from "./template-approval.read-verdict";

/** What `create --submit`'s brief poll managed to learn before it gave up. */
export interface CreateApprovalOutcome {
  /** The last status observed, or `undefined` when no probe ever found the row. */
  readonly status: string | undefined;
  /** Meta's stated reason. Only ever set alongside a `rejected` status. */
  readonly rejectionReason: string | undefined;
  /** Meta answered. `false` is a TIMEOUT and not a verdict. */
  readonly decided: boolean;
}

/**
 * Watch for Meta's verdict for as long as `create --submit` is willing to wait.
 *
 * 🔴 A `false` `decided` IS THE ORDINARY OUTCOME AND IT IS NOT AN ERROR. Meta's
 * review is routinely slower than this window; the command exits 0 and points at
 * `approvals`, because a CLI that failed on a pending review would be reporting
 * its own impatience as the template's rejection.
 *
 * Probe failures are SWALLOWED — a list call that throws is not a verdict, and
 * the template already exists either way, so a transient read failure must not
 * turn a successful create into a non-zero exit. The cost is that a persistently
 * failing read is indistinguishable here from a genuinely pending review; both
 * come back `decided: false`, which is what sends the operator to `approvals`.
 */
export async function awaitApprovalVerdictAfterCreate(
  listApprovals: () => Promise<unknown>,
  templateId: string
): Promise<CreateApprovalOutcome> {
  const reading = await pollForTerminalState(
    APPROVAL_POLL_AFTER_CREATE,
    async () => readApprovalVerdict(await listApprovals(), templateId, isApprovalDecided),
    "swallow"
  );

  return {
    status: reading?.value.status,
    rejectionReason: reading?.value.rejectionReason,
    decided: reading?.terminal === true
  };
}
