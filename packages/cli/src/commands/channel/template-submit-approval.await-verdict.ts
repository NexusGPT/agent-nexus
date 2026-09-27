import { pollForTerminalState, type PollWindow } from "../../util/poll-for-terminal-state";
import {
  type ApprovalDisposition,
  classifyApprovalStatus,
  readApprovalVerdict
} from "./template-approval.read-verdict";

/** How long this verb keeps asking, and how often. */
export const APPROVAL_POLL_WHEN_WAITING: PollWindow = {
  budgetMs: 120_000,
  intervalMs: 5_000
};

/** What `submit-approval --wait`'s poll arrived at. */
export interface SubmitApprovalOutcome {
  /** The last status observed, falling back to the one the submit itself returned. */
  readonly status: string;
  /** Meta's stated reason. Only ever set alongside a `rejected` status. */
  readonly rejectionReason: string | undefined;
  /**
   * A probe actually SAW a settled status.
   *
   * Distinct from `isApprovalTerminal(status)`, which can be true of the status
   * the submit returned without any probe having confirmed it. Only the
   * renderer's "Approval resolved" line is entitled to the first; the timeout
   * line keys off the second.
   */
  readonly observedTerminal: boolean;
  /**
   * How `status` classifies — see `template-approval.read-verdict.ts`.
   *
   * Always present, because `status` always is: it falls back to the status the
   * submit itself returned. `observedTerminal: false` has three causes and this
   * separates them — still `awaiting`, a status this CLI cannot read
   * (`unrecognised`), or a settled status that only the submit reported and no
   * probe ever confirmed.
   */
  readonly disposition: ApprovalDisposition;
}

/**
 * Watch for Meta's verdict for as long as `--wait` is willing to hold the
 * terminal.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS IS THE VERB WHOSE BEHAVIOUR MOVED, AND IT MOVED TO THE NARROW DEFINITION
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This poll used to stop on anything that was neither `pending` nor
 * `unsubmitted`. It now stops only on `approved` and `rejected`, because Twilio
 * documents a fifth status — `received` — which is a WAIT state and is neither
 * of the two the old spelling excluded. The console's own summary row buckets
 * `received` with `pending` as `awaitingMeta`; this poll called it a verdict.
 *
 * What an operator sees that they did not before, for a `received` template or
 * any status this CLI cannot read:
 *
 *   before  stops on the first probe, ~5 s. "Approval resolved: received",
 *           and `"timedOut": false` in the `--json` record.
 *   after   keeps asking for the full two minutes, then reports the timeout
 *           it actually had, with `"timedOut": true`.
 *
 * The cost is up to two minutes in the one case the old behaviour was fast, and
 * it was fast by announcing a resolution that had not happened. `--wait` is an
 * explicit request to wait that long.
 *
 * ── Probe failures are SWALLOWED here, and they used to PROPAGATE ─────────────
 *
 * The old site carried no stated reason, and the only one available — "report
 * the read failure rather than a pending status never observed" — is a job
 * `observedTerminal` already does without an exception: a failed poll returns
 * `false` there and falls back to the submit's own status, which is exactly the
 * honest report. What propagating added on top was abandoning the remaining ~115
 * seconds of the budget on the FIRST transient read, and turning a submit that
 * succeeded into a non-zero exit. Surviving a flaky read across repeated asks is
 * the entire reason this is a poll.
 *
 * It matters more here than at either sibling site, because a Content SID can be
 * submitted to Meta exactly ONCE: an exit code that reads as "the submit failed"
 * invites a retry that cannot succeed.
 *
 * The cost, which is the same one `create --submit` and `test-send --wait`
 * already accept in their own words: a persistently broken `listTemplateApprovals`
 * now reads as a timeout instead of an error, and the operator learns the real
 * cause from `nexus channel whatsapp-template approvals`, which the timeout line
 * already points them at.
 */
export async function awaitApprovalVerdict(
  listApprovals: () => Promise<unknown>,
  templateId: string,
  submittedStatus: string
): Promise<SubmitApprovalOutcome> {
  const reading = await pollForTerminalState(
    APPROVAL_POLL_WHEN_WAITING,
    async () => readApprovalVerdict(await listApprovals(), templateId),
    "swallow"
  );

  const status = reading?.value.status ?? submittedStatus;

  return {
    status,
    rejectionReason: reading?.value.rejectionReason,
    observedTerminal: reading?.terminal === true,
    disposition: classifyApprovalStatus(status)
  };
}
