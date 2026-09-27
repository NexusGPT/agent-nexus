import { pollForTerminalState, type PollWindow } from "../../util/poll-for-terminal-state";
import { type ApprovalDisposition, readApprovalVerdict } from "./template-approval.read-verdict";

/**
 * How long this verb keeps asking, and how often.
 *
 * ⚠️ The help text on `create` promises "30 SECONDS ONLY". That is the budget
 * below and it is NOT a wall-clock guarantee — see the floor-not-ceiling
 * warning in `poll-for-terminal-state.ts`.
 */
export const APPROVAL_POLL_AFTER_CREATE: PollWindow = {
  budgetMs: 30_000,
  intervalMs: 5_000
};

/** What `create --submit`'s brief poll managed to learn before it gave up. */
export interface CreateApprovalOutcome {
  /** The last status observed, or `undefined` when no probe ever found the row. */
  readonly status: string | undefined;
  /** Meta's stated reason. Only ever set alongside a `rejected` status. */
  readonly rejectionReason: string | undefined;
  /** Meta answered. `false` is a TIMEOUT and not a verdict. */
  readonly decided: boolean;
  /**
   * How the last observed status classified, or `undefined` when no probe ever
   * found the row.
   *
   * `decided: false` has three causes and this separates them: the review is
   * genuinely `awaiting`, the status is one this CLI cannot read
   * (`unrecognised`), or nothing was ever observed at all (`undefined`). A
   * renderer telling an operator "still pending" is only entitled to say so for
   * the first.
   */
  readonly disposition: ApprovalDisposition | undefined;
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
 *
 * This verb's notion of "terminal" is UNCHANGED by the convergence onto
 * `isApprovalTerminal`: it stopped on `approved`/`rejected` before and it stops
 * on exactly those now. `submit-approval --wait` is the side that moved — see
 * `template-submit-approval.await-verdict.ts`.
 */
export async function awaitApprovalVerdictAfterCreate(
  listApprovals: () => Promise<unknown>,
  templateId: string
): Promise<CreateApprovalOutcome> {
  const reading = await pollForTerminalState(
    APPROVAL_POLL_AFTER_CREATE,
    async () => readApprovalVerdict(await listApprovals(), templateId),
    "swallow"
  );

  return {
    status: reading?.value.status,
    rejectionReason: reading?.value.rejectionReason,
    decided: reading?.terminal === true,
    disposition: reading?.value.disposition
  };
}
