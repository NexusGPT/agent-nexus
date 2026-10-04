import { type VibeTenantClusterStatus } from "../../../vibe-regions";

// ============================================================
// apps cluster
// ============================================================

/**
 * The customer reading of the cluster: a fault, a routine update pending, or
 * nominal, with one plain sentence for it. `kind` is held as `string` so a
 * newer platform adding a kind is printed rather than rejected.
 */
export interface VibeClusterConditionDto {
  kind: string;
  summary: string;
}

/**
 * The cluster health the GET surface reports. `null` cluster = none provisioned.
 * Carries no raw `statusReason`: that is operator material and never leaves
 * the server. `vibe-cluster-wire.conformance.ts` holds this in lockstep.
 */
export interface VibeClusterHealthDto {
  status: VibeTenantClusterStatus;
  condition: VibeClusterConditionDto;
  gitHostStatus: string | null;
  telemetryStatus: string | null;
}

export interface GetVibeClusterResponse {
  cluster: VibeClusterHealthDto | null;
}

/** Discriminated outcome of an org's own opt-in. Mirrors the operator surface's. */
export type ProvisionVibeClusterOutcome =
  | {
      kind: "provisioning";
      reprovisioned: boolean;
      /**
       * Present and true only when the request declared nothing — a row was
       * already PROVISIONING and was reused. Absent on a fresh create and on a
       * reprovision.
       */
      reusedExistingRow?: boolean;
    }
  | { kind: "already_active"; status: VibeTenantClusterStatus };

export interface ProvisionVibeClusterResponse {
  outcome: ProvisionVibeClusterOutcome;
}
