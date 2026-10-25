import type { MountScope } from "../../mount-registry";
import type { DirectPlan } from "../../workspace-direct-mount/direct-plan";
import type { InstallPolicy } from "../../workspace-direct-mount/install/install-policy";
import type { MountId } from "../../workspace-direct-mount/mount-id";
import { settleDirectLocally } from "../../workspace-direct-mount/settle-direct-locally";
import { ensureRcloneCanMount } from "./ensure-rclone-can-mount";

/**
 * The direct engine's local refusals, in the order they are cheapest: the pins
 * its renewal needs, the credential_process line its renewal runs through, and
 * last the rclone build and FUSE layer its spawn needs — last because that one
 * may download and install software, which a refusal after it would waste.
 * `mount` and `remount` both settle through here, so the same machine is
 * refused in the same order by both.
 */
export async function planDirectMount(
  scope: MountScope,
  mountId: MountId,
  policy: InstallPolicy
): Promise<DirectPlan> {
  const local = settleDirectLocally(scope, mountId);
  if (!local.ok) throw local.refusal;
  const binary = await ensureRcloneCanMount("direct", policy);
  return { mountId, pins: local.pins, awsConfig: local.awsConfig, binary };
}
