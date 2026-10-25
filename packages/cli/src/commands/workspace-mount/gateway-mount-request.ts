import type { Engine } from "../../mount-registry";
import type { RcloneBinary } from "../../workspace-direct-mount/managed-rclone";
import type { MountId } from "../../workspace-direct-mount/mount-id";
import type { GatewayCache } from "./gateway-cache";

/** The engines that speak to the Nexus gateway; which one is the platform's call. */
export type GatewayEngine = Exclude<Engine, "direct">;

/**
 * A gateway engine after its local preflight. The rclone arm carries the one
 * binary the spawn may run and the mount id its cache folder is named by, so
 * a mount cannot be reached without settling first: the only way to hold one
 * is `settleGatewayMount`'s return value.
 */
export type GatewaySettlement =
  | { readonly engine: "webdav" }
  | { readonly engine: "rclone"; readonly binary: RcloneBinary; readonly mountId: MountId };

export type RcloneSettlement = Extract<GatewaySettlement, { readonly engine: "rclone" }>;

/**
 * What a gateway mount needs, as NAMED fields rather than a positional run.
 *
 * `slug`, `baseUrl`, `apiKey` and `mountPath` are four consecutive strings:
 * passed positionally, swapping any two type-checks and produces a drive that
 * 401s or serves the wrong path, and the engine switch cannot catch it because
 * four strings satisfy any signature structurally. `DirectMountRequest` beside
 * it already takes this shape for the same reason.
 */
export interface GatewayMountRequest {
  readonly settled: GatewaySettlement;
  readonly slug: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly mountPath: string;
  readonly readOnly: boolean;
  /** The admin-shared copy: its gateway path and rclone's cache folder are both per copy. */
  readonly shared: boolean;
  /** The global `--timeout`, in SECONDS. Unset leaves the mint's own default. */
  readonly timeoutSeconds?: number;
}

/** The gateway path of the copy a request mounts: the admin-shared one sits under `_shared/`. */
export function davPathOf(request: GatewayMountRequest): string {
  return request.shared ? `_shared/${request.slug}` : request.slug;
}

/** The cache folder an rclone drive runs on: its mount id, and the copy it mounts. */
export function cacheOf(request: GatewayMountRequest, settled: RcloneSettlement): GatewayCache {
  return { mountId: settled.mountId, shared: request.shared };
}
