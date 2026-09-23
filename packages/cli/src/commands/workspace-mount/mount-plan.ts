import type { DirectPlan } from "../workspace-mount-direct";
import type { GatewayEngine } from "../workspace-mount-gateway";

// ── Mount engines ─────────────────────────────────────────────────────────────
//
// Three engines mount a workspace, and they differ in WHO holds the credential:
//   - webdav → macOS `mount_webdav` against the Nexus WebDAV gateway. Nothing to
//              install, no kernel extension, and the server authorises every
//              request, so a revoked key stops the drive at once. macOS-only,
//              and the default there.
//   - rclone → rclone mounting the same gateway over FUSE, the API key in its
//              environment. Server-authorised like webdav, and it works with a
//              raw --api-key. The default on Linux (FUSE is in-kernel) and
//              Windows (WinFsp); retired on macOS, where webdav and direct cover
//              everything it did.
//   - direct → rclone signing S3 requests itself with a one-hour credential the
//              CLI mints from the API key and renews through
//              `credential-process`. Fast (rclone's VFS cache), opt-in
//              everywhere: macFUSE or FUSE-T on macOS, FUSE on Linux. Not on
//              Windows — its renewal hook runs through a POSIX shell.
//
// This module is what the engines and the verbs share. The engines are
// `workspace-mount-gateway.ts` (webdav, rclone) and `workspace-mount-direct.ts`;
// the four drive verbs are `workspace-mount.ts`, `workspace-remount.ts`,
// `workspace-unmount.ts` and `workspace-status.ts`; the CRUD verbs and the
// namespace are in `workspace.ts`.

/**
 * What `mount` settled before its first network call, by engine. A gateway
 * plan carries nothing but the engine; a direct plan carries the mount id, the
 * pins and the accepted credential_process line, so a consumer that reads
 * `mountId` has to prove the engine is `direct` first.
 */
export type MountPlan =
  | { readonly engine: GatewayEngine }
  | ({ readonly engine: "direct" } & DirectPlan);
