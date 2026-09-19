import type { Command } from "commander";

import { isJsonMode } from "../../../output";
import { type TenantHttpOptions, tenantRequest } from "../../../util/tenant-http";
import { type ListDeploymentsResponse, type RollbackAppResponse } from "../../../vibe-wire-types";
import { resolveRollbackTargetByVersion } from "../../apps-rollback-target";
import { printRollback } from "../_shared/print-rollback";
import { printTriggeredDeployment } from "../_shared/print-triggered-deployment";
import { ROLLBACK_TARGET_REFUSALS } from "../_shared/rollback-target-refusals";
import { runDeploymentWatch } from "../_shared/run-deployment-watch";
import { triggerDeploymentAnsweringOverage } from "../_shared/trigger-deployment-answering-overage";

/** `rollback --to <sha>`: an ordinary build+deploy of that commit. */
export async function redeployShaForRollback(
  program: Command,
  opts: TenantHttpOptions,
  appId: string,
  cmdOpts: { to?: string; confirmOverage?: boolean; watch?: boolean; skipVerification?: boolean },
  triggerSha: string
): Promise<void> {
  // The SAME flow `deploy --sha` runs, not a copy of it — including
  // the y/N spend prompt and the re-run hint, which a partial copy
  // here silently dropped. The hint names `rollback --to`, because
  // telling someone to re-run `deploy` is a wrong instruction.
  const data = await triggerDeploymentAnsweringOverage(
    opts,
    appId,
    triggerSha,
    `nexus apps rollback ${appId} --to ${cmdOpts.to}` +
      `${cmdOpts.skipVerification === true ? " --skip-verification" : ""}` +
      ` --confirm-overage`,
    cmdOpts.confirmOverage === true,
    // A `--to` rollback is an ordinary redeploy, so it meets the ship
    // gate like any other. Exposed here because the commit being
    // rolled BACK to is old and may predate the artifacts the app now
    // requires — refusing the recovery lever during an incident is
    // the wrong failure. The plain `rollback` (no --to) restores a
    // SUPERSEDED deployment without a build and never meets the gate
    // at all.
    false,
    cmdOpts.skipVerification === true
  );
  if (data === null) {
    process.exitCode = 1;
    return;
  }
  // Same single-document rule as `deploy --watch`; see there.
  const watchingRedeploy = cmdOpts.watch === true;
  if (!watchingRedeploy || !isJsonMode()) printTriggeredDeployment(data, appId);
  if (watchingRedeploy) {
    process.exitCode = await runDeploymentWatch(program, appId, data.deployment.id);
  }
}

/**
 * The atomic restore: re-activate an already-built SUPERSEDED deployment.
 *
 * `version` is null for a bare `rollback`, which is what selects the server's
 * own auto-pick of the most recent SUPERSEDED predecessor.
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
