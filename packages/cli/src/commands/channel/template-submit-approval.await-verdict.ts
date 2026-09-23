import { pollForTerminalState } from "../../util/poll-for-terminal-state";
import {
  APPROVAL_POLL_WHEN_WAITING,
  isApprovalNoLongerPending,
  readApprovalVerdict
} from "./template-approval.read-verdict";

/** What `submit-approval --wait`'s poll arrived at. */
export interface SubmitApprovalOutcome {
  /** The last status observed, falling back to the one the submit itself returned. */
  readonly status: string;
  /** Meta's stated reason. Only ever set alongside a `rejected` status. */
  readonly rejectionReason: string | undefined;
  /**
   * A probe actually SAW a settled status.
   *
   * Distinct from `isApprovalNoLongerPending(status)`, which can be true of the
   * status the submit returned without any probe having confirmed it. Only the
   * renderer's "Approval resolved" line is entitled to the first; the timeout
   * line keys off the second.
   */
  readonly observedTerminal: boolean;
}

/**
 * Watch for Meta's verdict for as long as `--wait` is willing to hold the
 * terminal.
 *
 * 🔴 A PROBE FAILURE PROPAGATES HERE AND IS SWALLOWED IN
 * `template-create.await-verdict.ts`, FOR THE SAME OPERATION ON THE SAME LIST.
 * That difference is inherited from the two call sites and is preserved rather
 * than reconciled — changing either one changes what an operator is told after a
 * transient read failure, which is a behaviour decision and not a split's to
 * make. Here the submit has already happened, so the caller catches and reports
 * the read failure against the approval it created.
 */
export async function awaitApprovalVerdict(
  listApprovals: () => Promise<unknown>,
  templateId: string,
  submittedStatus: string
): Promise<SubmitApprovalOutcome> {
  const reading = await pollForTerminalState(
    APPROVAL_POLL_WHEN_WAITING,
    async () => readApprovalVerdict(await listApprovals(), templateId, isApprovalNoLongerPending),
    "propagate"
  );

  return {
    status: reading?.value.status ?? submittedStatus,
    rejectionReason: reading?.value.rejectionReason,
    observedTerminal: reading?.terminal === true
  };
}
