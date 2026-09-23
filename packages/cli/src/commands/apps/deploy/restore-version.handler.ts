import type { Command } from "commander";

import { isJsonMode } from "../../../output";
import { type TenantHttpOptions, tenantRequest } from "../../../util/tenant-http";
import { type ListDeploymentsResponse, type RollbackAppResponse } from "../../../vibe-wire-types";
import { printRollback } from "../_shared/print-rollback";
import { ROLLBACK_TARGET_REFUSALS } from "../_shared/rollback-target-refusals";
import { runDeploymentWatch } from "../_shared/run-deployment-watch";
import { resolveRollbackTargetByVersion } from "../rollback-target/resolve-rollback-target-by-version";

/**
 * The atomic restore: re-activate an already-built SUPERSEDED deployment.
 *
 * This is what `rollback` MEANS — both the bare form and `--to-version <n>`,
 * which are one operation differing only in which version they name. `version`
 * is null for a bare `rollback`, which is what selects the server's own
 * auto-pick of the most recent SUPERSEDED predecessor.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * IT SHARES NO MACHINERY WITH `redeploy-sha.handler.ts`, ONLY A COMMAND NAME.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Nothing is built, no version number is spent, and the restore is one
 * transaction on the server. So the two gates the redeploy path carries —
 * the verification ship gate and the usage-overage question — are not bypassed
 * here, they are never reached: there is no build to gate and no new usage to
 * meter. That is why `--skip-verification` and `--confirm-overage` are
 * documented as `--to`-only flags, and it is the reason the two operations
 * cannot share an implementation without one of them reading as a variant of
 * the other.
 */
export async function restoreRollbackVersion(
  program: Command,
  opts: TenantHttpOptions,
  appId: string,
  version: number | null,
  watching: boolean
): Promise<void> {
  // Resolve BEFORE the POST, so a version that cannot be a target costs
  // one read and no state change. `targetDeploymentId` stays undefined
  // for a bare `rollback`, which is what selects the server's own
  // auto-pick of the most recent SUPERSEDED predecessor.
  //
  // 🚨 Never fall back to that auto-pick when a NAMED version fails to
  // resolve. Omitting the field would roll the app onto whatever came
  // last — a different version from the one the operator typed, applied
  // silently. Every path below either sends a resolved id or returns.
  let targetDeploymentId: string | undefined;
  if (version !== null) {
    const listed = await tenantRequest<ListDeploymentsResponse>(opts, {
      method: "GET",
      path: `/api/vibe/apps/${encodeURIComponent(appId)}/deployments`
    });

    const resolution = resolveRollbackTargetByVersion(appId, listed.deployments, version);
    if (!resolution.ok) {
      process.exitCode = ROLLBACK_TARGET_REFUSALS[resolution.kind](
        resolution.message,
        resolution.hint
      );
      return;
    }
    targetDeploymentId = resolution.target.id;
  }

  const data = await tenantRequest<RollbackAppResponse>(opts, {
    method: "POST",
    path: `/api/vibe/apps/${encodeURIComponent(appId)}/rollback`,
    // Spread conditionally rather than sending `{ targetDeploymentId:
    // undefined }`: the body schema is `.default({})` for callers that
    // predate the field, and an explicit undefined would serialise to
    // `{}` anyway — but only the conditional form makes "no body at
    // all" and "a body naming a target" visibly different at this site.
    ...(targetDeploymentId === undefined ? {} : { body: { targetDeploymentId } })
  });

  if (!watching || !isJsonMode()) printRollback(data);

  if (watching) {
    process.exitCode = await runDeploymentWatch(program, appId, data.restoredDeployment.id);
  }
}
