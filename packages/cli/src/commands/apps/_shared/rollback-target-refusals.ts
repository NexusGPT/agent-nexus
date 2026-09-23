import { refuse, reportFailure } from "../../../errors";
import { type RollbackTargetRefusalKind } from "../rollback-target/rollback-target-resolution";

// ============================================================
// apps rollback
// ============================================================

/**
 * How each resolution refusal leaves the process, and what `code` its error
 * document carries.
 *
 * A `Record` over the closed union rather than a `switch` with a default: a new
 * refusal kind is then a COMPILE ERROR here until somebody decides what it
 * exits with, instead of silently shipping as a generic `failed`. That is the
 * argument `errors.ts` makes for `FAILURE_CAUSE_EXIT_CATEGORIES`, one layer down.
 *
 * The split is between "you named something that is not there" and "you named
 * something that is there and is not a legal target":
 *
 *  - `not-found` — no such version, or no versions at all. The named thing does
 *    not exist, which is exactly what that cause is for.
 *  - `invalid-input` (via `refuse`) — the version exists but cannot be this
 *    flag's argument. `refuse` has no `code` parameter by design, so the label
 *    cannot be got wrong here.
 *  - `remote-error` for ambiguity, and it is the least comfortable of the
 *    three: the HTTP call SUCCEEDED, so nothing "failed" remotely in the usual
 *    sense. It is still a remote fault — the server returned a list that
 *    contradicts its own `@@unique([vibeAppId, versionNumber])` constraint —
 *    and of the six causes this is the only one that puts the fault where it
 *    actually is. Calling it `invalid-input` would blame the operator for a
 *    string they typed correctly.
 */
export const ROLLBACK_TARGET_REFUSALS: Readonly<
  Record<RollbackTargetRefusalKind, (message: string, hint: string) => number>
> = {
  "no-deployments": (message, hint) => reportFailure("not-found", message, hint),
  "no-such-version": (message, hint) => reportFailure("not-found", message, hint),
  "already-serving": (message, hint) => refuse(message, hint),
  "not-restorable": (message, hint) => refuse(message, hint),
  "target-has-no-image": (message, hint) => refuse(message, hint),
  "ambiguous-version": (message, hint) => reportFailure("remote-error", message, hint)
};
