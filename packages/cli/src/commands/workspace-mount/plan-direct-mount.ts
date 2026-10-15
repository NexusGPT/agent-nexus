import type { MountScope } from "../../mount-registry";
import { directAwsConfigOrRefuse } from "../../workspace-direct-mount/accepted-aws-config";
import { directPins } from "../../workspace-direct-mount/direct-pins";
import type { DirectPlan } from "../../workspace-direct-mount/direct-plan";
import type { InstallPolicy } from "../../workspace-direct-mount/install/install-policy";
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
  mountId: string,
  policy: InstallPolicy
): Promise<DirectPlan> {
  const pins = directPins(scope);
  const awsConfig = directAwsConfigOrRefuse(mountId);
  const binary = await ensureRcloneCanMount("direct", policy);
  return { mountId, pins, awsConfig, binary };
}
