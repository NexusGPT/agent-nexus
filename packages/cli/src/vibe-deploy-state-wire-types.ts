/**
 * DEPLOY STATE — the one read that answers "did my push land, and is what I
 * pushed what is live".
 *
 * Mirrors packages/types/src/api/domains/vibe/schemas/deploy-state.schemas.ts.
 * Every field is documented at length on the schema it copies, and the two that
 * are easy to misread are re-documented here because this file is what the
 * renderer reads.
 *
 * Split out of `vibe-wire-types.ts`, which re-exports every name below, so no
 * import site moved. Re-declared rather than imported for the reason that file
 * gives: the CLI ships standalone and `@nexus/types` is not a runtime
 * dependency. `vibe-deploy-state-wire-types.conformance.ts` is the gate.
 */

import type {
  VibeDeployStateOutcome,
  VibeDeployStateResolvedFrom,
  VibeUnlistedValue
} from "./vibe-deploy-state-vocabulary";
import type { VibeBuildJobDto, VibeDeploymentDto } from "./vibe-deployment-wire-types";

/** A branch or tag head as the platform recorded it — the receipt for a push. */
export interface VibeRefDto {
  id: string;
  vibeGitProjectId: string;
  organizationId: string;
  refName: string;
  sha: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The deployment in the live slot — the newest HEALTHY row.
 *
 * 🔴 HEALTHY is the ALLOCATION's verdict and lands BEFORE the edge swaps, so
 * this is not "what the URL returns". `servedProvenAt` is the only field that
 * speaks to that, and a `null` in it means NOT PROVEN, never "not serving".
 */
export interface VibeLiveDeploymentDto {
  deploymentId: string;
  versionNumber: number;
  commitSha: string;
  url: string | null;
  /** Non-null only when `served` below names THIS deployment. See its doc. */
  servedProvenAt: string | null;
  createdAt: string;
}

/**
 * What the edge was last OBSERVED answering with.
 *
 * 🔴 AN OBSERVATION, NOT A LIVE READING. Nothing re-checks it after it is
 * written, so `provenAt` is mandatory to render: a rollback, a teardown or a
 * newer deploy since that instant is not reflected here. Printing this object
 * without its age repeats — one layer up — the mistake of reading a healthy
 * deployment as a served one.
 */
export interface VibeServedArtifactDto {
  deploymentId: string;
  commitSha: string;
  imageRef: string;
  provenAt: string;
  healthyToServedMs: number;
}

/** `outcome` and `resolved.from` can carry a value this binary does not list — see `VibeUnlistedValue`. */
export interface GetDeployStateResponse {
  outcome: VibeDeployStateOutcome | VibeUnlistedValue;
  resolved: {
    sha: string | null;
    refName: string | null;
    from: VibeDeployStateResolvedFrom | VibeUnlistedValue;
  };
  ref: VibeRefDto | null;
  deployment: VibeDeploymentDto | null;
  buildJob: VibeBuildJobDto | null;
  live: VibeLiveDeploymentDto | null;
  served: VibeServedArtifactDto | null;
}
