import type { PollReading } from "../../util/poll-for-terminal-state";

/**
 * One row of `listTemplateApprovals`, as the printers and the polls read it.
 *
 * Three call sites reached into this loosely-typed list through `(a: any)`, so a
 * renamed field would have compiled and matched nothing, in silence.
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

/**
 * What a poll must DO about a status it has just read.
 *
 * 🔴 THREE STATES, BECAUSE TWO CANNOT SAY "I DO NOT KNOW THIS ONE". A boolean
 * files an unrecognised status under either "stop" or "keep asking", and each is
 * an assertion the CLI has no grounds for. From outside the process the two
 * failures are identical: a command that exited over a template nobody read.
 */
export type ApprovalDisposition = "settled" | "awaiting" | "unrecognised";

/**
 * Twilio's vocabulary, partitioned. Written down three times in this repository
 * already and cited rather than re-derived a fourth: the api client's
 * `twilio-template-approvals.api.ts` ("unsubmitted | received | pending |
 * approved | rejected"), the console's `whatsapp-template-view.mapper.ts`, and
 * `approval-buckets.ts`, which buckets `received` WITH `pending` as
 * `awaitingMeta` behind a test asserting its buckets partition the list.
 *
 * 🔴 `received` DECIDES THE SHAPE OF THIS FILE. It is a wait state — Twilio holds
 * the submission and Meta has not ruled — and it is neither `pending` nor
 * `unsubmitted`. So a predicate spelled "not pending and not unsubmitted" calls
 * it a verdict TODAY, not one day.
 */
const SETTLED_STATUSES: readonly string[] = ["approved", "rejected"];
const AWAITING_STATUSES: readonly string[] = ["unsubmitted", "received", "pending"];

/** What one approval probe managed to learn about a template. */
export interface ApprovalVerdict {
  readonly status: string;
  /** Meta's stated reason. Only ever populated alongside a `rejected` status. */
  readonly rejectionReason: string | undefined;
  /**
   * How {@link classifyApprovalStatus} read `status`.
   *
   * A reading's `terminal` flag collapses `awaiting` and `unrecognised` into one
   * `false`, and those want different words: "still pending" against "Meta
   * reports a status this CLI does not know". No renderer branches on it yet —
   * it is here so the one that does reads this rather than starting a new list.
   */
  readonly disposition: ApprovalDisposition;
}

/**
 * Read one status into what the poll should do about it.
 *
 * ⚠️ CASE-SENSITIVE ON PURPOSE, WHERE THE BACKEND'S MAPPER IS NOT. Copying its
 * lower-casing here would be a regression: `template-create.verdict.render.ts`
 * tests `status === "rejected"` and prints an approval line for every OTHER
 * settled status, so recognising `"Rejected"` as settled would route a rejection
 * straight into it. Left alone, a mixed-case status is `unrecognised`: the poll
 * keeps asking and the raw string still reaches `--json`.
 */
export function classifyApprovalStatus(status: string): ApprovalDisposition {
  if (SETTLED_STATUSES.includes(status)) return "settled";
  if (AWAITING_STATUSES.includes(status)) return "awaiting";
  return "unrecognised";
}

/**
 * Stop polling: Meta has ruled. THE ONE TERMINAL PREDICATE — both approval polls
 * reach it through {@link readApprovalVerdict} and neither can pass a different
 * one, so they can no longer disagree about one template on one list.
 *
 * 🔴 AN UNRECOGNISED STATUS IS NOT TERMINAL, AND THAT IS THE ONLY DECISION THIS
 * FUNCTION MAKES. Two contracts already forbid the other direction:
 * `CreateApprovalOutcome.decided` promises "Meta answered" and
 * `SubmitApprovalOutcome.observedTerminal` promises "a probe SAW a settled
 * status". Worse, `template-create.verdict.render.ts` turns any decided status
 * that is not `rejected` into a line saying Meta approved the template — so
 * calling an unknown status terminal prints an approval Meta never gave. Polling
 * too long costs time; the other direction costs a wrong verdict, and only one
 * of the two is recoverable.
 *
 * The cost of this direction: a status Meta introduces that IS final polls to
 * the budget and reports as a timeout. It still reaches `--json`, with
 * {@link ApprovalVerdict.disposition} saying which of the three it was.
 */
export function isApprovalTerminal(status: string): boolean {
  return classifyApprovalStatus(status) === "settled";
}

/**
 * Find this template's approval row in a `listTemplateApprovals` payload and say
 * what it reports, or `undefined` when the payload carries no status for it yet.
 * The payload is a row or an array of them depending on how many exist.
 *
 * The terminal predicate is NOT a parameter. It used to be, and that parameter
 * was the mechanism by which the two polls disagreed — each passed its own.
 * Fixing the call makes the convergence structural: nothing is left to differ on.
 */
export function readApprovalVerdict(
  approvals: unknown,
  templateId: string
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
      rejectionReason: status === "rejected" ? request?.rejection_reason : undefined,
      disposition: classifyApprovalStatus(status)
    },
    terminal: isApprovalTerminal(status)
  };
}
