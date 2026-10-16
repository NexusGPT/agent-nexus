/**
 * THE DEPLOYMENT ROUTES' RESPONSES — cancel, rollback, list and get.
 *
 * The deployment and build-job ROWS themselves are `vibe-deployment-wire-types.ts`;
 * what is here is the envelope each route answers with. The TRIGGER response is
 * `vibe-deployment-trigger-wire-types.ts`, on its own because it is the one
 * envelope that reaches the approval surface.
 *
 * Split out of `vibe-wire-types.ts`, which re-exports every name below, so no
 * import site moved. Re-declared rather than imported for the reason that file
 * gives: the CLI ships standalone and `@nexus/types` is not a runtime
 * dependency. `vibe-deployment-request-wire-types.conformance.ts` is the gate.
 */

import type { VibeBuildJobDto, VibeDeploymentDto } from "./vibe-deployment-wire-types";

/**
 * `POST /api/vibe/apps/:id/rollback` — the predecessor re-activated, and the
 * deployment it displaced. Both rows come back in full so the caller can name
 * the two versions without a second read.
 */
export interface RollbackAppResponse {
  restoredDeployment: VibeDeploymentDto;
  supersededDeployment: VibeDeploymentDto;
}

/**
 * `POST /api/vibe/apps/:appId/deployments/:deploymentId/cancel` — discriminated
 * on `outcome`, mirroring `CancelVibeDeploymentBuildResponseSchema`. Both arms
 * are a 2xx: `already_ended` means there was nothing to stop and nothing was
 * written, and it carries the rows as they stand so the caller can say what
 * actually became of the build.
 */
export type CancelDeploymentBuildResponse =
  | { outcome: "cancelled"; deployment: VibeDeploymentDto; buildJob: VibeBuildJobDto }
  | { outcome: "already_ended"; deployment: VibeDeploymentDto; buildJob: VibeBuildJobDto | null };

export interface ListDeploymentsResponse {
  deployments: VibeDeploymentDto[];
}

export interface GetDeploymentResponse {
  deployment: VibeDeploymentDto;
  buildJob: VibeBuildJobDto | null;
}
