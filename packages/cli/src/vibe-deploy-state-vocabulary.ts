/**
 * The two enum-valued fields of `GET /api/vibe/apps/:appId/deploy-state` —
 * `outcome` and `resolved.from` — as this binary lists them, plus the type for a
 * value it does not.
 *
 * Mirrors `packages/types/src/api/domains/vibe/schemas/deploy-state.schemas.ts`.
 * Its own module rather than a block in `vibe-wire-types.ts` because that file
 * sits on the shrink-only size ledger, and these are runtime values the renderer
 * needs as well as types. `vibe-wire-types.conformance.ts` holds both lists to
 * the contract's, in both directions.
 */

/**
 * A value of a server enum this binary does not list — still the exact string
 * the server sent.
 *
 * A published binary routinely talks to a backend newer than itself, and the
 * contract reads such a value as unlisted rather than failing the response, so a
 * field that can carry one is typed `ListedValue | VibeUnlistedValue`. The listed
 * half is narrowed with the field's own `is…` guard before anything indexes by
 * it, and every word the renderer has is keyed on the listed half — so a value
 * listed later does not compile until it has words.
 *
 * `Record<never, never>` keeps the type distinct from a bare `string`, which
 * would swallow the listed literals and every exhaustiveness check with them.
 */
export type VibeUnlistedValue = string & Record<never, never>;

/** What became of a commit, as ONE value to branch on. */
export const VIBE_DEPLOY_STATE_OUTCOMES = [
  "DEPLOYED",
  "RECEIVED_NOT_DEPLOYED",
  "NOT_RECEIVED",
  "REF_UNKNOWN",
  "NO_REPOSITORY"
] as const;
export type VibeDeployStateOutcome = (typeof VIBE_DEPLOY_STATE_OUTCOMES)[number];

export function isVibeDeployStateOutcome(
  value: VibeDeployStateOutcome | VibeUnlistedValue
): value is VibeDeployStateOutcome {
  const listed: readonly string[] = VIBE_DEPLOY_STATE_OUTCOMES;
  return listed.includes(value);
}

/** Which of the three ways of asking produced the commit under question. */
export const VIBE_DEPLOY_STATE_RESOLVED_FROM = ["sha", "ref", "deployBranch"] as const;
export type VibeDeployStateResolvedFrom = (typeof VIBE_DEPLOY_STATE_RESOLVED_FROM)[number];

export function isVibeDeployStateResolvedFrom(
  value: VibeDeployStateResolvedFrom | VibeUnlistedValue
): value is VibeDeployStateResolvedFrom {
  const listed: readonly string[] = VIBE_DEPLOY_STATE_RESOLVED_FROM;
  return listed.includes(value);
}
