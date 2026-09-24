/**
 * What resolving `--to-version` can answer: the one row, or a refusal saying
 * why there isn't one.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A REFUSAL IS RETURNED AS DATA RATHER THAN THROWN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every refusal is a value carrying its own `kind`, `message` and `hint`. That
 * buys two things a `throw` does not: the whole decision table is testable
 * without a process, a stub or a spy; and the mapping from refusal to EXIT CODE
 * lives in one `Record` at the call site, so a new refusal kind is a compile
 * error until somebody decides what it exits with. `errors.ts` makes the same
 * argument for `FailureCause` and this is that pattern, one layer down.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THESE ARE BETTER MESSAGES, NEVER A SECOND SOURCE OF TRUTH
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ The server re-checks every one of these, and it is the authority. The
 * checks exist because the server can only ever refuse in terms of a deployment
 * ID — `deployment 6f1e… is already the version serving app …` is useless to
 * someone who typed `--to-version 7` and never saw a uuid.
 *
 * ⚠️ The list read and the rollback POST are two calls, so a local verdict can
 * go stale between them. That is deliberate and the direction is chosen: a local
 * check can only ever REFUSE something the server might have accepted (annoying,
 * recoverable by re-running), never ACCEPT something the server refuses — the
 * server still guards, and its 404/409 is what the operator sees in that case.
 * A false refusal costs a re-run; a false acceptance would cost a wrong
 * production rollback, and nothing here can produce one.
 */

import type { VibeDeploymentDto } from "../../../vibe-deployment-wire-types";

/**
 * Why a named version cannot be the target. Each kind is a DIFFERENT cause with
 * a DIFFERENT action, which is the test for whether it deserves its own entry:
 * two kinds that would print the same remedy should have been one.
 */
export type RollbackTargetRefusalKind =
  /** The app has no deployments at all — nothing has ever been built for it. */
  | "no-deployments"
  /** No deployment carries this version number. */
  | "no-such-version"
  /** The named version is the one already serving. */
  | "already-serving"
  /** The named version exists but never reached a state that can be restored. */
  | "not-restorable"
  /** Superseded, but its image is gone — there is nothing to put back. */
  | "target-has-no-image"
  /** More than one row claims this version. Refuse rather than guess. */
  | "ambiguous-version";

export interface RollbackTargetRefusal {
  ok: false;
  kind: RollbackTargetRefusalKind;
  /** What is wrong, in the operator's own vocabulary (versions, not uuids). */
  message: string;
  /** What to do about it. Always present — a refusal with no way forward is half an answer. */
  hint: string;
}

export interface RollbackTargetResolved {
  ok: true;
  target: VibeDeploymentDto;
}

export type RollbackTargetResolution = RollbackTargetResolved | RollbackTargetRefusal;
