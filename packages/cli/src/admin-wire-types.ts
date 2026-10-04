/**
 * The wire shapes `admin.ts` receives from the Vibe admin endpoints.
 *
 * WHY THEY ARE HAND-DECLARED. The CLI publishes as a standalone npm package, so
 * `@nexus/types` cannot be a runtime dependency: it pulls Zod and, transitively,
 * the generated Prisma enums — the +5MB the type-only import rule exists to keep
 * out of a bundle. So these are copies of the `ZAdminVibe*` contracts under
 * `packages/types/src/api/domains/admin/`.
 *
 * WHY THEY LIVE HERE RATHER THAN IN `admin.ts`. A copy is safe only while
 * something FAILS when it stops matching the original. That something is
 * `admin-wire-types.conformance.ts`, and it can only compare shapes it can
 * import — so the declarations have to be exported from a module of their own.
 * The comment they used to carry ("keep these shapes in lockstep when the
 * backend evolves") was the only thing asking, and TWO had already drifted past
 * it:
 *
 *   · `AdminVibeBuildJobResponse.builder` was `"NIXPACKS" | "DOCKERFILE"`. The
 *     contract made it NULLABLE, with its own comment saying why: null while
 *     nobody has observed the build strategy — PENDING, RUNNING, or a timeout
 *     that never reported. `vibe-build-job claim` is the command that produces
 *     exactly that row, so the CLI declared a string on the one response that
 *     is reliably null.
 *   · `AdminVibeDeploymentResponse` had no `versionNumber`, the user-facing
 *     monotonic `v{n}`. The contract's comment says "`color` is the internal
 *     blue/green slot; admins see both" — and the admin CLI could not print it,
 *     because an unmodelled key is simply not there to print.
 *
 * Neither broke a command. That is the failure mode: a missing key renders as
 * nothing and a nullable one renders as `null`, so both read as "the server did
 * not send it" rather than as a stale copy.
 */

export interface AdminVibeBuildJobResponse {
  id: string;
  vibeDeploymentId: string;
  organizationId: string;
  status:
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
   * NULLABLE, and the null is the common case rather than the edge one: the
   * build strategy is reported with the job's TERMINAL outcome, so every
   * PENDING or RUNNING row — including the one `vibe-build-job claim` returns —
   * carries null here.
   */
  builder: "NIXPACKS" | "DOCKERFILE" | "GENERATED" | null;
  logsRef: string;
  durationMs: number | null;
  errorReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminVibeDeploymentResponse {
  id: string;
  vibeAppId: string;
  organizationId: string;
  color: "BLUE" | "GREEN";
  /**
   * The user-facing monotonic version (`v{n}`). `color` is the internal
   * blue/green slot; an admin needs both, and asking one which deployment is
   * live gets a slot name rather than a version without this.
   */
  versionNumber: number;
  status:
    | "BUILDING"
    | "AWAITING_APPROVAL"
    | "DEPLOYING"
    | "HEALTHY"
    | "FAILED"
    | "ROLLED_BACK"
    | "SUPERSEDED"
    | "DISPLACED"
    | "CANCELLED";
  triggerSha: string;
  imageRef: string;
  errorReason: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Discriminated outcome. Mirrors `AdminVibeBuildRunnerTickOutcome` in the
 * @nexus/types schema + `DispatchNextVibeBuildJobOutcome` in the backend use
 * case. Exhaustiveness in `printTickRecord` is enforced via the never-narrowing
 * check — every new variant surfaces as a TS error at the formatter rather than
 * as a silent runtime branch.
 */
export type AdminVibeBuildRunnerTickResponse =
  | { kind: "idle" }
  | { kind: "dispatched"; buildJobId: string }
  | { kind: "race_lost"; buildJobId: string }
  | {
      kind: "org_at_capacity";
      buildJobId: string;
      organizationId: string;
      inFlight: number;
      cap: number;
    }
  | {
      kind: "region_at_capacity";
      buildJobId: string;
      organizationId: string;
      region: string;
      computeSize: "MEDIUM" | "LARGE";
      inFlight: number;
      cap: number;
    }
  | { kind: "dispatch_failed_requeued"; buildJobId: string; attempt: number; reason: string }
  | {
      kind: "dispatch_failed_compensated";
      buildJobId: string;
      retryable: boolean;
      reason: string;
    };

/**
 * Discriminated outcome. Mirrors `AdminVibeDeploymentRunnerTickOutcome` in the
 * @nexus/types schema + `DispatchNextReadyVibeDeploymentOutcome` in the backend
 * use case. No `race_lost` variant — the deployer has no claim step (the row is
 * already DEPLOYING when picked up).
 */
export type AdminVibeDeploymentRunnerTickResponse =
  | { kind: "idle" }
  | { kind: "dispatched"; deploymentId: string }
  | {
      kind: "dispatch_failed_compensated";
      deploymentId: string;
      retryable: boolean;
      reason: string;
    }
  | { kind: "timed_out"; deploymentId: string; ageMs: number }
  | { kind: "displaced"; deploymentId: string; displacedByDeploymentId: string };
