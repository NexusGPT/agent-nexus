import { type VibeTenantClusterStatus } from "../../../vibe-regions";

// ============================================================
// apps cluster
// ============================================================

/** The cluster health the GET surface reports. `null` cluster = none provisioned. */
export interface VibeClusterHealthDto {
  status: VibeTenantClusterStatus;
  statusReason: string | null;
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
