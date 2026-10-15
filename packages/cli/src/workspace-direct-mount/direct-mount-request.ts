import type { createClient } from "../client";
import type { AcceptedAwsConfig } from "./accepted-aws-config";
import type { DirectPins } from "./direct-pins";
import type { RcloneBinary } from "./managed-rclone";

/** Everything one direct mount needs, as NAMED fields rather than a positional run. */
export interface DirectMountRequest {
  readonly slug: string;
  readonly mountPath: string;
  /** The access asked for; the server may grant less. */
  readonly readOnly: boolean;
  /** True when the admin-shared copy is the target — the mint then names it by id. */
  readonly shared: boolean;
  readonly workspaceId?: string;
  readonly mountId: string;
  readonly baseUrl: string;
  readonly pins: DirectPins;
  readonly awsConfig: AcceptedAwsConfig;
  readonly binary: RcloneBinary;
  readonly client: ReturnType<typeof createClient>;
}
