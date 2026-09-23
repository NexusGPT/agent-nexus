/**
 * Resolving `nexus apps rollback --to-version <n>` to exactly ONE deployment.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS RESOLUTION IS THE RISKY HALF, AND THE REQUEST IS NOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `POST /api/vibe/apps/:id/rollback` already accepts `Body.targetDeploymentId`
 * and has since NEX-3083 — it is what the console's per-row "Roll back to this"
 * sends. So the request is a solved problem and this file adds nothing to it.
 *
 * What is NOT solved is that an operator has a VERSION NUMBER (`v7` — the thing
 * every CLI surface prints) and the endpoint wants a DEPLOYMENT ID (a uuid the
 * operator has to go and find). Mapping one to the other is the whole feature,
 * and it is the half that can go wrong in a way that costs a production
 * deployment: pick the wrong row and the platform faithfully rolls an app onto a
 * version nobody asked for.
 *
 * 🚨 SO THE RULE IS: RESOLVE TO EXACTLY ONE ROW, OR REFUSE. There is no
 * "closest", no "most recent matching", and no falling back to the server's
 * auto-pick when the named version cannot be found — a `--to-version 7` that
 * silently restored v9 because v7 was unusable would be the worst possible
 * outcome, and it is exactly what omitting `targetDeploymentId` from the body
 * would do.
 *
 * `rollback-target-resolution.ts` carries why a refusal is data rather than a
 * throw, and why these checks are better messages and not a second authority.
 */

import type { VibeDeploymentDto } from "../../../vibe-wire-types";
import { describeRestorable } from "./describe-restorable";
import { redeployHint } from "./redeploy-hint";
import { RESTORABLE_STATUS, SERVING_STATUS } from "./restorable-status";
import type { RollbackTargetResolution } from "./rollback-target-resolution";

/**
 * Map a version number onto the one deployment a rollback should target.
 *
 * The order of the checks is the part to read, because two of them can be true
 * of the same row and only the FIRST one produces a message worth reading:
 *
 *  1. **No deployments at all.** Distinct from "no such version" — the app has
 *     never been deployed, so listing restorable versions would print nothing
 *     and "no version v7" would send the operator hunting for a v7 that could
 *     not exist. Different cause, different action.
 *  2. **Ambiguity.** BEFORE any judgement about the match, because judging one
 *     of several rows means having already picked one.
 *  3. **Already serving.** BEFORE the restorable check, and this is the
 *     ordering trap: the serving version is HEALTHY, so it is also not
 *     SUPERSEDED, so it satisfies "not restorable" too. Check the general
 *     condition first and an operator asking to roll back onto the version
 *     already live is told "v7 is HEALTHY and only a superseded version can be
 *     restored" — true, unhelpful, and it hides that they have already got what
 *     they asked for.
 *  4. **Wrong status**, then **no image** — narrowing, in that order. A
 *     BUILDING or FAILED row is also imageless, for an unrelated reason, so
 *     testing the image first would report "no retained image" for a version
 *     whose real problem is that it never served. The server splits these two
 *     the same way and for the same reason.
 *
 * @param deployments the app's deployments as `ListDeployments` returns them —
 *   every non-soft-deleted row, so an absence here is a real absence and not a
 *   page boundary. That endpoint takes no limit and no cursor; if it ever grows
 *   one, this function's "no such version" verdict stops being sound and the
 *   caller must page before calling it.
 */
export function resolveRollbackTargetByVersion(
  appId: string,
  deployments: readonly VibeDeploymentDto[],
  version: number
): RollbackTargetResolution {
  const label = `v${String(version)}`;

  if (deployments.length === 0) {
    return {
      ok: false,
      kind: "no-deployments",
      message: `App ${appId} has no deployments, so there is no ${label} to roll back to.`,
      hint: `Deploy something first: nexus apps deploy ${appId} --sha <sha>.`
    };
  }

  const matches = deployments.filter((deployment) => deployment.versionNumber === version);

  if (matches.length > 1) {
    // Unreachable against today's server: `@@unique([vibeAppId, versionNumber])`
    // is a hard constraint with no `deletedAt` in it, so one app cannot hold two
    // rows with one version number. It is still refused rather than assumed
    // away — this list arrives over a wire, the constraint is a fact about a
    // schema this package does not compile against, and the failure mode of
    // guessing is a production rollback onto the wrong version. Refusing costs
    // an operator one confused re-run; guessing costs them their app.
    const ids = matches.map((deployment) => deployment.id).join(", ");
    return {
      ok: false,
      kind: "ambiguous-version",
      message: `App ${appId} reports more than one deployment numbered ${label} (${ids}), so there is no single version to restore.`,
      hint: `Version numbers are unique per app, so this should not be possible. Re-run to fetch a fresh list; if it repeats, contact support with those ids.`
    };
  }

  const match = matches[0];
  if (match === undefined) {
    return {
      ok: false,
      kind: "no-such-version",
      message: `App ${appId} has no ${label}.`,
      hint: describeRestorable(appId, deployments)
    };
  }

  if (match.status === SERVING_STATUS) {
    return {
      ok: false,
      kind: "already-serving",
      message: `${label} is the version app ${appId} is already serving, so rolling back to it would change nothing.`,
      hint: `Name a different version, or run "nexus apps rollback ${appId}" with no flag to restore whatever came before it. ${describeRestorable(appId, deployments)}`
    };
  }

  if (match.status !== RESTORABLE_STATUS) {
    return {
      ok: false,
      kind: "not-restorable",
      message: `${label} is ${match.status}, and only a superseded version — one that served traffic and kept its image — can be restored.`,
      hint: `${redeployHint(appId, match)} ${describeRestorable(appId, deployments)}`
    };
  }

  if (match.imageRef === "") {
    return {
      ok: false,
      kind: "target-has-no-image",
      message: `${label} is superseded but its image is no longer recorded, so there is nothing to put back.`,
      hint: `${redeployHint(appId, match)} ${describeRestorable(appId, deployments)}`
    };
  }

  return { ok: true, target: match };
}
