import type { Engine, MountRecord } from "../../mount-registry";
import { settleGatewayMount } from "../workspace-mount-gateway";
import { detachDeadMount } from "./detach-dead-mount";
import { retireDeadGatewayRow } from "./gateway-cache";
import type { MountPlan } from "./mount-plan";
import { type AutoMountInput, planAutoMount } from "./plan-auto-mount";
import { planDirectMount } from "./plan-direct-mount";
import { retireDeadDirectRow } from "./retire-dead-direct-row";

/**
 * Retire a dead row the new mount replaces: its direct session or its rclone
 * cache first (either may refuse over unsent saves), then its mount-table
 * entry, then its registry row.
 */
export function retireDeadRow(
  mounts: Record<string, MountRecord>,
  hit: { readonly key: string; readonly record: MountRecord },
  /** Null for another scope's row: no plan of ours uploads its saves. */
  plan: MountPlan | null,
  shared: boolean
): void {
  retireDeadDirectRow(hit.record, plan);
  retireDeadGatewayRow(
    hit.record,
    plan?.engine === "rclone" ? { mountId: plan.mountId, shared } : null
  );
  detachDeadMount(hit.record);
  delete mounts[hit.key];
}

/**
 * The engines' own local refusals, before the one mint: for direct, the pins
 * its renewal needs, then the credential_process line its renewal runs
 * through, then the rclone build and the FUSE layer the spawn needs (the one
 * step that may install); for rclone, the same rclone preflight. Each names its
 * fix, and nothing has been minted.
 *
 * When rclone or its FUSE layer is missing, the preflight may download and
 * install them first, as `policy` allows; `auto` reads the workspace list's
 * answer first, so it never offers an install for an engine it will not use.
 */
export async function planMount(
  requested: Engine | "auto",
  auto: AutoMountInput
): Promise<MountPlan> {
  const { scope, mountId, policy } = auto;
  if (requested === "auto") return planAutoMount(auto);
  if (requested !== "direct") return settleGatewayMount(requested, policy, mountId);
  return { engine: requested, ...(await planDirectMount(scope, mountId, policy)) };
}
