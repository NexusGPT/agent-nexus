/**
 * The outcome an operator's SERVER-ROLL REQUEST answers with — `nexus admin
 * vibe-tenant-cluster request-server-roll`.
 *
 * Its own module, beside `admin-vibe-tenant-cluster-wire-types.ts`, for the
 * reason that file gives for splitting by surface. Hand-declared because the CLI
 * publishes standalone and `@nexus/types` cannot be a runtime dependency;
 * `admin-vibe-tenant-cluster-server-roll-wire-types.conformance.ts` is what fails
 * `pnpm typecheck` the moment this stops matching
 * `AdminVibeTenantClusterRequestServerRollOutcomeSchema`.
 */

import type { VibeTenantClusterStatus } from "./vibe-regions";
import type { ListedDiscriminants, VibeUnlistedVariant } from "./vibe-unlisted-variant";

/**
 * Discriminated outcome of a server-roll request. Only `requested` writes: it
 * stamps a new server roll generation and moves the cluster HEALTHY → DEGRADED
 * so the next reconcile tick converges it. Every other kind writes nothing.
 */
export type VibeTenantClusterRequestServerRollOutcome =
  | { kind: "requested"; requestedAt: string; reason: string }
  | { kind: "already_pending"; requestedAt: string; reason: string | null }
  | { kind: "reconcile_paused"; status: VibeTenantClusterStatus; pausedReason: string | null }
  | { kind: "not_settled"; status: VibeTenantClusterStatus }
  | { kind: "not_found" };

export type VibeTenantClusterRequestServerRollOutcomeRead =
  | VibeTenantClusterRequestServerRollOutcome
  | VibeUnlistedVariant<"kind">;

export const REQUEST_SERVER_ROLL_OUTCOME_KINDS: ListedDiscriminants<
  VibeTenantClusterRequestServerRollOutcome,
  "kind"
> = {
  requested: true,
  already_pending: true,
  reconcile_paused: true,
  not_settled: true,
  not_found: true
};
