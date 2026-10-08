/**
 * WHAT A `POST …/:serverId/sync` ANSWER ACTUALLY SAYS, AS FIVE STATES.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 THE DEFECT THIS MODULE EXISTS FOR: `FAILED` WAS ONE STATE AND IS TWO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The route answers 202 whether the job was queued or the queue refused it, so the
 * leaf reads `lastSyncOutcome`. That is necessary and it is NOT sufficient, and the
 * insufficiency is a false statement rather than a missing nuance:
 *
 * | the row says | what happened | the remedy |
 * |---|---|---|
 * | `QUEUED` | the job is on the queue | wait, then read `get` |
 * | `SUCCEEDED` | a warm queue finished before the response was composed | read `get` |
 * | `FAILED` + `DISCOVERY_NOT_QUEUED` | **no discovery happened**; the queue refused | RE-RUN this command |
 * | `FAILED` + any other code | **a discovery RAN** and the remote lost | fix the remote; re-running repeats it |
 * | anything else, or `null` | a state this release does not list | read `get` and report it |
 *
 * Rows three and four are opposite facts, and the first version of this leaf reported
 * BOTH as *"No discovery was queued"*. The leaf already accepted `SUCCEEDED` as "the
 * queue finished first", so the same race against a remote that FAILS was a completed
 * discovery rendered as a refused enqueue — and an operator or a script then retries
 * and waits for work that already ran.
 *
 * ## The discriminator is `lastSyncErrorCode`, and it is OUR vocabulary
 *
 * `McpSyncErrorCode` is written only by `SyncMcpServerUseCase` and by the enqueue's own
 * verdict write; no remote authors it. `DISCOVERY_NOT_QUEUED` is the one member that
 * means the discovery never started, so it is the one tested for — every other value,
 * INCLUDING one a newer pod wrote and this release has never heard of, means a
 * discovery ran. That direction is deliberate: a new remote-failure class added
 * upstream then reads as "it ran and failed", which is true of every member of that
 * family, where the opposite default would claim nothing happened.
 *
 * ## Why this is a separate module from the leaf
 *
 * `run-verdict.ts` is the same split for the same reason: the classification is a
 * pure function worth scoring on its own, and the leaf's `.action` is not reachable
 * from a test without driving the command.
 *
 * The DOCUMENT each non-accepted verdict means is `sync-refusal.ts`. Two files because
 * they are two responsibilities — what the answer SAYS, and what the operator is TOLD —
 * and because together they crossed the 150-line ceiling
 * `source-file-size.ledger.test.ts` holds every file under `packages/cli/src` to, whose
 * own remedy says SPLIT rather than write a row.
 */
export type McpSyncVerdict =
  /** The job is on the queue and the discovery has not run. */
  | { readonly outcome: "queued" }
  /** A warm queue ran the whole discovery before this response was composed. */
  | { readonly outcome: "already-succeeded" }
  /** The queue REFUSED the job. Nothing is coming. */
  | { readonly outcome: "not-queued" }
  /** A discovery ran and the remote failed, under this code. */
  | { readonly outcome: "ran-and-failed"; readonly errorCode: string }
  /** Neither — a value this release does not list, or no outcome recorded at all. */
  | { readonly outcome: "unlisted"; readonly reported: string };

/** The one `McpSyncErrorCode` that means the discovery never started. */
export const DISCOVERY_NOT_QUEUED_CODE = "DISCOVERY_NOT_QUEUED";

/**
 * Read the two sync columns as one verdict.
 *
 * `null` is NOT accepted: a row that records no outcome at all is not a queued
 * discovery, and reporting it as one would claim a write that did not happen.
 */
export function classifyMcpSyncAnswer(
  lastSyncOutcome: string | null,
  lastSyncErrorCode: string | null
): McpSyncVerdict {
  if (lastSyncOutcome === "QUEUED") return { outcome: "queued" };
  if (lastSyncOutcome === "SUCCEEDED") return { outcome: "already-succeeded" };
  if (lastSyncOutcome === "FAILED") {
    return lastSyncErrorCode === DISCOVERY_NOT_QUEUED_CODE
      ? { outcome: "not-queued" }
      : { outcome: "ran-and-failed", errorCode: lastSyncErrorCode ?? "NO_CODE_RECORDED" };
  }
  return { outcome: "unlisted", reported: lastSyncOutcome ?? "null" };
}

/** `true` for the two verdicts the leaf prints a payload for. */
export function isAcceptedMcpSyncVerdict(verdict: McpSyncVerdict): boolean {
  return verdict.outcome === "queued" || verdict.outcome === "already-succeeded";
}
