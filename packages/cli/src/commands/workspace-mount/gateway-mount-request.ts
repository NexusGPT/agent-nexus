import type { Engine } from "../../mount-registry";
import type { RcloneBinary } from "../../workspace-direct-mount/managed-rclone";

/** The engines that speak to the Nexus gateway; which one is the platform's call. */
export type GatewayEngine = Exclude<Engine, "direct">;

/**
 * A gateway engine after its local preflight. The rclone arm carries the one
 * binary the spawn may run, so a mount cannot be reached without settling
 * first: the only way to hold one is `settleGatewayMount`'s return value.
 */
export type GatewaySettlement =
  | { readonly engine: "webdav" }
  | { readonly engine: "rclone"; readonly binary: RcloneBinary };

/**
 * What a gateway mount needs, as NAMED fields rather than a positional run.
 *
 * `slug`, `davPath`, `baseUrl`, `apiKey` and `mountPath` are five consecutive
 * strings: passed positionally, swapping any two type-checks and produces a
 * drive that 401s or serves the wrong path, and the engine switch cannot catch
 * it because five strings satisfy any signature structurally.
 * `DirectMountRequest` beside it already takes this shape for the same reason.
 */
export interface GatewayMountRequest {
  readonly settled: GatewaySettlement;
  readonly slug: string;
  readonly davPath: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly mountPath: string;
  readonly readOnly: boolean;
  /** The global `--timeout`, in SECONDS. Unset leaves the mint's own default. */
  readonly timeoutSeconds?: number;
}
