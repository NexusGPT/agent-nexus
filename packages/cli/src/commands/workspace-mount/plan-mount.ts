import type { Engine, MountRecord, MountScope } from "../../mount-registry";
import type { InstallPolicy } from "../../workspace-direct-mount/install/install-policy";
import { mountIdFor } from "../../workspace-direct-mount/mount-id";
import { planDirectMount, retireDeadDirectRow } from "../workspace-mount-direct";
import { settleGatewayMount } from "../workspace-mount-gateway";
import { detachDeadMount } from "./detach-dead-mount";
import type { MountPlan } from "./mount-plan";

/**
 * Retire a dead row the new mount replaces: its direct session and cache first
 * (this may refuse), then its mount-table entry, then its registry row.
 */
export function retireDeadRow(
  mounts: Record<string, MountRecord>,
  hit: { readonly key: string; readonly record: MountRecord },
  plan: MountPlan
): void {
  retireDeadDirectRow(hit.record, plan);
  detachDeadMount(hit.record);
  delete mounts[hit.key];
}

/**
 * The engines' own local refusals, before the one network call below:
 * for direct, the pins its renewal needs, then the credential_process
 * line its renewal runs through, then the rclone build and the FUSE
 * layer the spawn needs (the one step that may install); for rclone,
 * the same rclone preflight. Each names its fix, and nothing has been
 * minted.
 *
 * Nothing here reaches Nexus. When rclone or its FUSE layer is missing, the
 * preflight may download and install them first, as `policy` allows.
 */
export async function planMount(
  engine: Engine,
  scope: MountScope,
  key: string,
  policy: InstallPolicy
): Promise<MountPlan> {
  if (engine !== "direct") return settleGatewayMount(engine, policy);
  return { engine, ...(await planDirectMount(scope, mountIdFor(key), policy)) };
}
