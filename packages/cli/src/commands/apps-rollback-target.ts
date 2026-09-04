/**
 * Resolving `nexus apps rollback --to-version <n>` to exactly ONE deployment.
 *
 * Split out of `apps.ts` (already ~3.9k lines) for the same reason
 * `apps-watch.ts` and `apps-git-local.ts` are: the interesting logic is pure and
 * worth testing on its own, and the IO around it is a thin shell.
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
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A REFUSAL IS RETURNED AS DATA RATHER THAN THROWN
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every refusal below is a value carrying its own `kind`, `message` and `hint`.
 * That buys two things a `throw` does not: the whole decision table is testable
 * without a process, a stub or a spy; and the mapping from refusal to EXIT CODE
 * lives in one `Record` at the call site, so a new refusal kind is a compile
 * error until somebody decides what it exits with. `errors.ts` makes the same
 * argument for `FailureCause` and this is that pattern, one layer down.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS IS A BETTER MESSAGE, NEVER A SECOND SOURCE OF TRUTH
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ The server re-checks every one of these, and it is the authority. The
 * checks here exist because the server can only ever refuse in terms of a
 * deployment ID — `deployment 6f1e… is already the version serving app …` is
 * useless to someone who typed `--to-version 7` and never saw a uuid.
 *
 * ⚠️ The list read and the rollback POST are two calls, so a local verdict can
 * go stale between them. That is deliberate and the direction is chosen: a local
 * check can only ever REFUSE something the server might have accepted (annoying,
 * recoverable by re-running), never ACCEPT something the server refuses — the
 * server still guards, and its 404/409 is what the operator sees in that case.
 * A false refusal costs a re-run; a false acceptance would cost a wrong
 * production rollback, and nothing here can produce one.
 */

import type { VibeDeploymentDto } from "../vibe-wire-types";
import type { WatchDeploymentStatus } from "./apps-watch";

/**
 * The one status a rollback target may hold.
 *
 * Typed as {@link WatchDeploymentStatus} rather than a bare string so a rename
 * in the schema's mirrored union is a compile error here, instead of this
 * constant quietly matching nothing and every version reading as unrestorable.
 *
 * Only SUPERSEDED, and that is the server's rule rather than this file's:
 * `RollbackVibeDeploymentUseCase` hands the target to `beginRestore()`, whose
 * state machine refuses anything else. A SUPERSEDED row is the only one that
 * both SERVED traffic and kept its image — which is why DISPLACED, whose
 * schema comment spells out that "nothing ever verified it", is not a restore
 * candidate however healthy its image looks.
 */
const RESTORABLE_STATUS: WatchDeploymentStatus = "SUPERSEDED";

/**
 * The status of the version currently taking traffic.
 *
 * Checked BEFORE the restorable check, and the order is load-bearing rather
 * than cosmetic — see {@link resolveRollbackTargetByVersion}.
 */
const SERVING_STATUS: WatchDeploymentStatus = "HEALTHY";

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

/**
 * A deployment that could be rolled back to right now: superseded, and its
 * retained image still recorded.
 *
 * The `imageRef` half mirrors the server's `target-not-placeable` guard. The
 * auto-pick path never meets an imageless SUPERSEDED row because its finder
 * filters them out; an explicitly named target is looked up by id alone, so the
 * check has to exist wherever the target is named — there, and here.
 */
function isRestorable(deployment: VibeDeploymentDto): boolean {
  return deployment.status === RESTORABLE_STATUS && deployment.imageRef !== "";
}

/** How many versions a hint lists before deferring to the full listing. */
const MAX_LISTED_VERSIONS = 5;

/**
 * The versions a rollback could name right now, newest first.
 *
 * Exported because the refusals are only as useful as this list — an operator
 * told "no version v7" wants to know what there IS, and the alternative is
 * making them run a second command to find out.
 */
export function restorableVersions(deployments: readonly VibeDeploymentDto[]): number[] {
  return deployments
    .filter(isRestorable)
    .map((deployment) => deployment.versionNumber)
    .sort((a, b) => b - a);
}

/**
 * The "here is what you can actually do" half of every refusal hint.
 *
 * Says the honest thing when the list is EMPTY rather than printing an empty
 * enumeration: "restorable versions: " with nothing after it reads as a
 * rendering bug, and leaves the operator without the one fact that explains the
 * refusal — that no version of this app is restorable at all.
 */
function describeRestorable(appId: string, deployments: readonly VibeDeploymentDto[]): string {
  const versions = restorableVersions(deployments);
  const listing = `Run "nexus apps deployments list ${appId}" to see every version.`;

  if (versions.length === 0) {
    return `No version of this app can be rolled back to — a target has to be a superseded version that still has its image. ${listing}`;
  }

  const shown = versions.slice(0, MAX_LISTED_VERSIONS).map((version) => `v${String(version)}`);
  const overflow = versions.length > MAX_LISTED_VERSIONS ? ", …" : "";
  return `Restorable versions: ${shown.join(", ")}${overflow}. ${listing}`;
}

/**
 * "Redeploy that commit instead" — the correct remedy whenever the named
 * version exists but cannot be RESTORED.
 *
 * A restore re-places a retained image; a version with no usable image can only
 * be reached by building its commit again. The deployment row carries that
 * commit, so the hint names the exact command rather than describing it.
 */
function redeployHint(appId: string, deployment: VibeDeploymentDto): string {
  return `To ship that commit again, build it: nexus apps deploy ${appId} --sha ${deployment.triggerSha}.`;
}

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

/**
 * Read a `--to-version` value.
 *
 * Accepts a leading `v` because every surface in this CLI PRINTS the version
 * that way — `apps deployments list` renders a `Version` column of `v7`, and
 * `apps rollback` reports `v3 → v2`. Refusing the exact string the product just
 * showed the operator is a footgun with no upside, so `7` and `v7` are the same
 * argument.
 *
 * Returns `null` rather than throwing so the caller refuses through the one
 * error funnel with the rest of them; a throw here would land in the generic
 * `handleError` catch and print a less specific document.
 */
export function parseTargetVersion(raw: string): number | null {
  const trimmed = raw.trim();
  // Anchored, and digits only after an optional `v`: `parseInt` would read
  // "7abc" as 7 and "1e3" as 1, turning a typo into a silent wrong target.
  if (!/^v?\d+$/i.test(trimmed)) return null;

  const version = Number(trimmed.replace(/^v/i, ""));
  // Version numbers start at 1 — `deploymentSeq` is bumped BEFORE it is
  // stamped, so no row ever carries 0. `Number.isSafeInteger` rejects a value
  // long enough to lose precision, which would otherwise compare equal to a
  // different version.
  if (!Number.isSafeInteger(version) || version < 1) return null;

  return version;
}
