/**
 * The WIRE SHAPES of one Vibe deployment and its build job, as the CLI reads
 * them off `GET /api/vibe/apps/:appId/deployments[/:deploymentId]`, the deploy
 * trigger, the rollback and deploy-state.
 *
 * Mirrors `packages/types/src/api/domains/vibe/schemas/deployments.schemas.ts`,
 * re-declared for the reason `vibe-wire-types.ts` gives: the CLI ships
 * standalone and `@nexus/types` is not a runtime dependency. It is its own
 * module for the reason `vibe-domain-wire-types.ts` is: `vibe-wire-types.ts`
 * sits on the shrink-only size ledger, and the deployment shapes are one
 * cohesive surface that can live apart from it.
 * `vibe-deployment-wire-types.conformance.ts` is the gate that fails `pnpm
 * typecheck` when one of these stops matching the contract.
 */

/** Subset of VibeDeploymentSchema the CLI renders. */
export interface VibeDeploymentDto {
  id: string;
  vibeAppId: string;
  color: string;
  /// User-facing monotonic version (`v{n}`). `color` is the internal
  /// blue/green slot and is no longer rendered.
  versionNumber: number;
  status: string;
  triggerSha: string;
  imageRef: string;
  /// The port the BUILD observed the image listening on. Null means NOT
  /// OBSERVED — the deploy then falls back to the platform default, so a null
  /// here and a `8080` here are different facts and must not render alike.
  detectedPort: number | null;
  forceRebuild: boolean;
  errorReason: string | null;
  /// Why it failed, as the structured code the platform minted — the only field
  /// a surface may classify a failure on (`errorReason` is the human detail).
  /// Optional as well as nullable: a backend a release behind omits the key,
  /// and a newer one may send a code this binary does not know, so it stays a
  /// plain string here and is never switched on exhaustively.
  reasonCode?: string | null;
  /// The newer deployment that displaced this one. Non-null only on a
  /// DISPLACED row. Optional as well as nullable, because a backend a release
  /// behind does not send the key, and the published binary has to print that
  /// row rather than crash on it.
  displacedBy?: VibeDeploymentDisplacerDto | null;
  createdAt: string;
}

/** Mirrors `VibeDeploymentDisplacerSchema`: enough to name and fetch the newer deployment. */
export interface VibeDeploymentDisplacerDto {
  id: string;
  versionNumber: number;
  triggerSha: string;
}

/**
 * Lifecycle of a build job. Mirrors `VibeBuildJobStatus` in the schema, and
 * `vibe-deployment-wire-types.conformance.ts` holds the two to the same members.
 *
 * The DTO fields stay `status: string`: a newer backend may send a value this
 * published binary has never heard of, and the renderer passes that through
 * instead of refusing the row. This union is for the renderer's exhaustive
 * Records, which should fail to compile when the contract grows.
 */
export type VibeBuildJobStatus =
  | "PENDING"
  | "QUEUED"
  | "ADMITTED"
  | "STARTING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "TIMED_OUT"
  | "CANCELLED"
  | "SUPERSEDED"
  | "LOST";

/**
 * Why a build has not started — computed by the server on every read, never
 * stored. Mirrors `VibeBuildWaitSchema`; `message` is rendered as-is.
 */
export type VibeBuildWaitDto =
  | { reason: "org_at_capacity"; inFlight: number; cap: number; message: string }
  | { reason: "queued"; message: string };

/** Subset of VibeBuildJobSchema the CLI renders. */
export interface VibeBuildJobDto {
  id: string;
  vibeDeploymentId: string;
  status: string;
  /// Null until the executor reports which strategy it actually used.
  builder: string | null;
  logsRef: string;
  durationMs: number | null;
  errorReason: string | null;
  /// Why it failed, as the structured code the platform minted — the only field
  /// a surface may classify a failure on (`errorReason` is the human detail).
  /// Optional as well as nullable: a backend a release behind omits the key,
  /// and a newer one may send a code this binary does not know, so it stays a
  /// plain string here and is never switched on exhaustively.
  reasonCode?: string | null;
  /// Null once the build is admitted or has ended.
  waiting: VibeBuildWaitDto | null;
  createdAt: string;
}
