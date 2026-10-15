import type { AcceptedAwsConfig } from "./accepted-aws-config";
import type { DirectPins } from "./direct-pins";
import type { RcloneBinary } from "./managed-rclone";

/**
 * What the direct engine settles locally before its first network call.
 *
 * The type is here and `planDirectMount` — which may download and install
 * rclone — is in `commands/workspace-mount/plan-direct-mount.ts`, because this
 * directory is the engine's spawn-free half.
 */
export interface DirectPlan {
  readonly mountId: string;
  readonly pins: DirectPins;
  readonly awsConfig: AcceptedAwsConfig;
  /** The rclone the preflight probed — the only one the spawn may run. */
  readonly binary: RcloneBinary;
}
