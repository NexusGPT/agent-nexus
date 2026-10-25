import type { RcloneEngine } from "../../mount-registry";
import type { DepsIo } from "../../workspace-direct-mount/deps-io";
import type { InstallPolicy } from "../../workspace-direct-mount/install/install-policy";
import type { RcloneBinary } from "../../workspace-direct-mount/managed-rclone";
import { rcloneReadiness } from "./rclone-readiness";
import { realDepsIo } from "./real-deps-io";

/**
 * `rcloneReadiness` with its refusal thrown, for a caller with no other engine
 * to go to: the one rclone the spawn may run, or `local-failed` with the fix.
 */
export async function ensureRcloneCanMount(
  engine: RcloneEngine,
  policy: InstallPolicy,
  io: DepsIo = realDepsIo()
): Promise<RcloneBinary> {
  const ready = await rcloneReadiness(engine, policy, { io });
  if (!ready.ok) throw ready.refusal;
  return ready.binary;
}
