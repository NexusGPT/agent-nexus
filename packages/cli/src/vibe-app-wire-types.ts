/**
 * THE APP ITSELF, and the four lenient vocabularies its fields are read with.
 *
 * Split out of `vibe-wire-types.ts`, which re-exports every name below, so no
 * import site moved. Re-declared rather than imported for the reason that file
 * gives: the CLI ships standalone and `@nexus/types` is not a runtime
 * dependency. `vibe-app-wire-types.conformance.ts` is the gate that holds each
 * declaration here to the contract it copies.
 */

import type { VibeUnlistedValue } from "./vibe-deploy-state-vocabulary";

/**
 * Mirrors `VIBE_APP_DEFAULT_CONTAINER_PORT` in
 * `packages/types/src/schemas/VibeApp/container-port.ts`, re-declared for the
 * same reason as the wire types above — this package cannot depend on
 * `@nexus/types` at runtime.
 *
 * Used only to NAME the fallback in a message ("not detected — using 8080"),
 * never to decide anything: the port that is actually published is resolved
 * server-side. So a drift here misprints a hint; it cannot mis-deploy.
 */
export const VIBE_DEFAULT_CONTAINER_PORT = 8080;

/**
 * How hard the server-side ship gate applies to an app's deploys. Mirrors
 * `VibeShipGateModeSchema` in
 * packages/types/src/shared/domain/vibe/ship-gate-mode.ts.
 *
 * THREE STATES, AND THE MIDDLE ONE IS THE REASON THIS TYPE EXISTS. `OFF` and
 * `ENFORCE` are what the older boolean `requireVerification` called `false` and
 * `true`. `WARN` is the on-ramp: the gate reads the repository, records what it
 * found, and the deploy ships anyway. It is the state an operator rolling gates
 * out across a fleet actually wants, and no boolean can express it — which is
 * why every CLI surface reads this field and not the boolean beside it.
 */
export type VibeShipGateMode = "OFF" | "WARN" | "ENFORCE";

/**
 * The compute an app's image builds on. Mirrors `VibeBuildComputeSizeSchema` in
 * packages/types/src/shared/domain/vibe/build-compute-size.ts. `MEDIUM` is
 * CodeBuild's 7 GB / 4 vCPU, `LARGE` its 15 GB / 8 vCPU and the default.
 */
export type VibeBuildComputeSize = "MEDIUM" | "LARGE";

/** Who may reach the app's public URL. Mirrors the Prisma enum `VibeAppVisibility`. */
export type VibeAppVisibility = "PRIVATE" | "PUBLIC";

/** What the tenant's edge last said about the app's public host. Mirrors `VibeAppEdgeReachability`. */
export type VibeAppEdgeReachability =
  | "ROUTED"
  | "UNROUTED"
  | "UNAVAILABLE"
  | "NO_SUCH_APP"
  | "UNKNOWN";

/**
 * A Vibe app, mirroring `VibeAppSchema` in
 * packages/types/src/api/domains/vibe/schemas/core.ts. Keep in lockstep
 * (the CLI ships standalone — `@nexus/types` is not a runtime dep).
 */
export interface VibeAppDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  requireApprovals: boolean;
  /**
   * `shipGateMode === "ENFORCE"`, projected by the server for clients that
   * predate the mode. LOSSY BY CONSTRUCTION: `WARN` projects to `false`, so this
   * field cannot tell a warning app from an ungated one. Read `shipGateMode`.
   */
  requireVerification: boolean;
  /**
   * OPTIONAL because a backend one release behind this binary omits the key
   * entirely, and this CLI never runs the Zod schema that would default it. An
   * absent value is UNREPORTED, never `OFF` — printing the default here would
   * reproduce, one layer down, the exact defect that made this field render.
   */
  shipGateMode?: VibeShipGateMode | VibeUnlistedValue;
  deployBranch: string;
  resourceQuotas: { cpuMhz: number; memoryMiB: number; maxInstances: number };
  /**
   * The compute the app's image builds on, separate from `resourceQuotas`.
   * OPTIONAL for the reason `shipGateMode` is: a backend one release behind
   * omits it, and absent is UNREPORTED, never `LARGE`.
   */
  buildComputeSize?: VibeBuildComputeSize | VibeUnlistedValue;
  healthCheckConfig: Record<string, unknown>;
  publicUrl: string | null;
  visibility: VibeAppVisibility | VibeUnlistedValue;
  /**
   * What the tenant's edge last said about this app's public host. `null` means
   * NEVER OBSERVED — the probe only asks about a healthy, settled deployment —
   * and must never be printed as if it meant healthy.
   */
  edgeReachability: VibeAppEdgeReachability | VibeUnlistedValue | null;
  edgeReachabilityAt: string | null;
  edgeReachabilityDetail: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Why an app can or cannot deploy right now — the ONE thing standing in the
 * way, named. Mirrors `VibeAppDeployability` in
 * packages/types/src/shared/domain/vibe/app-deployability.ts.
 *
 * DERIVED server-side from the git project that resolves for the app, never
 * stored, so it cannot go stale. It is the one-field answer to "why does my
 * URL do nothing": before it, an app with no source at all rendered exactly
 * like a correctly-wired app nobody had pushed to yet.
 */
export type VibeAppDeployability = "DEPLOYABLE" | "NO_SOURCE_ATTACHED" | "SOURCE_NOT_READY";
