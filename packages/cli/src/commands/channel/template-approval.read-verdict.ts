import type { PollReading, PollWindow } from "../../util/poll-for-terminal-state";

/**
 * One row of `listTemplateApprovals`, as the printers and the polls read it.
 *
 * The SDK types this list loosely, and three call sites reached into it through
 * `(a: any)` — so a renamed field would have compiled, printed an empty column
 * and matched nothing, in silence. Naming the shape once puts the read under the
 * compiler at every one of them.
 */
export interface TemplateApprovalRow {
  sid?: string;
  approvalRequests?: {
    name?: string;
    category?: string;
    status?: string;
    rejection_reason?: string;
  };
}

/** What one approval probe managed to learn about a template. */
export interface ApprovalVerdict {
  readonly status: string;
  /** Meta's stated reason. Only ever populated alongside a `rejected` status. */
  readonly rejectionReason: string | undefined;
}

/**
 * How long `create --submit` keeps asking, and how often.
 *
 * ⚠️ The help text on `create` promises "30 SECONDS ONLY". That is the budget
 * below and it is NOT a wall-clock guarantee — see the floor-not-ceiling warning
 * in `poll-for-terminal-state.ts`.
 */
export const APPROVAL_POLL_AFTER_CREATE: PollWindow = {
  budgetMs: 30_000,
  intervalMs: 5_000
};

/** How long `submit-approval --wait` keeps asking, and how often. */
export const APPROVAL_POLL_WHEN_WAITING: PollWindow = {
  budgetMs: 120_000,
  intervalMs: 5_000
};

/**
 * `create --submit` stops here: Meta has said yes or no.
 *
 * 🔴 THIS DISAGREES WITH {@link isApprovalNoLongerPending} BELOW, AND THE
 * DISAGREEMENT IS INHERITED, NOT DESIGNED. The two commands poll the same list
 * for the same template and stop on different sets, so a status that is neither
 * `pending`/`unsubmitted` nor `approved`/`rejected` ends one poll and not the
 * other. Naming both predicates is what makes that visible; reconciling them
 * changes what an operator is told and is not this split's call to make.
 */
export function isApprovalDecided(status: string): boolean {
  return status === "approved" || status === "rejected";
}

/** `submit-approval --wait` stops here: anything that is not still waiting. */
export function isApprovalNoLongerPending(status: string): boolean {
  return status !== "pending" && status !== "unsubmitted";
}

/**
 * Find this template's approval row in a `listTemplateApprovals` payload and say
 * what it reports, or `undefined` when the payload carries no status for it yet.
 *
 * The payload is either a row or an array of them depending on how many exist,
 * which is why the normalisation is here rather than repeated at each caller.
 */
export function readApprovalVerdict(
  approvals: unknown,
  templateId: string,
  isTerminal: (status: string) => boolean
): PollReading<ApprovalVerdict> | undefined {
  const rows: TemplateApprovalRow[] = Array.isArray(approvals)
    ? (approvals as TemplateApprovalRow[])
    : [approvals as TemplateApprovalRow];

  const request = rows.find((row) => row.sid === templateId)?.approvalRequests;
  const status = request?.status;
  if (status === undefined) return undefined;

  return {
    value: {
      status,
      rejectionReason: status === "rejected" ? request?.rejection_reason : undefined
    },
    terminal: isTerminal(status)
  };
}
