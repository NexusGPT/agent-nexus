import type { MountRecord } from "../mount-registry";
import type { InstallPolicy } from "../workspace-direct-mount/install/install-policy";
import { ensureRcloneCanMount } from "./workspace-mount/ensure-rclone-can-mount";
import type {
  GatewayEngine,
  GatewayMountRequest,
  GatewaySettlement
} from "./workspace-mount/gateway-mount-request";
import type { MountOutcome } from "./workspace-mount/mount-outcome";
import { mountRclone } from "./workspace-mount/mount-rclone";
import { mountWebdav } from "./workspace-mount/mount-webdav";

// ── The gateway engines: webdav and rclone, both server-authorised ────────────
//
// Both talk to the Nexus WebDAV gateway, so the server authorises every request
// and a revoked key stops the drive at once. They differ only in the mounter:
// macOS's native `mount_webdav` in `workspace-mount/mount-webdav.ts`, or rclone
// over FUSE in `workspace-mount/mount-rclone.ts`. The direct engine — which
// signs storage requests itself — is `workspace-mount-direct.ts`.
//
// `workspace-mount/perform-mount.ts` and `workspace-mount/plan-mount.ts` reach
// the engine through the two functions below; its vocabulary is imported from
// `workspace-mount/gateway-mount-request.ts` directly, so there is no facade to
// keep in step with it.

/**
 * A gateway engine settles only its spawn's preflight: rclone must be able to
 * mount — offering to install what is missing, as `policy` allows — and webdav
 * needs nothing.
 */
export async function settleGatewayMount(
  engine: GatewayEngine,
  policy: InstallPolicy
): Promise<GatewaySettlement> {
  switch (engine) {
    case "webdav":
      return { engine };
    case "rclone":
      return { engine, binary: await ensureRcloneCanMount(engine, policy) };
    default:
      return engine satisfies never;
  }
}

function mountSettled(request: GatewayMountRequest): Promise<MountRecord> {
  const { settled } = request;
  switch (settled.engine) {
    case "webdav":
      return mountWebdav(request);
    case "rclone":
      return mountRclone(request, settled.binary);
    default:
      return settled satisfies never;
  }
}

export async function mountGateway(request: GatewayMountRequest): Promise<MountOutcome> {
  return {
    record: await mountSettled(request),
    grantedReadOnly: false,
    pendingUploads: null,
    // A gateway mount never mints, so it never hears the server's name for the
    // org. The caller falls back to the profile's copy, exactly as before.
    serverOrgName: null
  };
}
