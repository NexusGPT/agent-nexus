import type { DirectPlan } from "../../workspace-direct-mount/direct-plan";
import type { GatewaySettlement } from "./gateway-mount-request";

// ── Mount engines ─────────────────────────────────────────────────────────────
//
// Three engines mount a workspace, and they differ in WHO holds the credential:
//   - direct → rclone signing S3 requests itself with a one-hour credential the
//              CLI mints from the API key and renews through
//              `credential-process`. Fast (rclone's VFS cache); what `auto`
//              mounts on macOS and Linux (`platform-rules.ts`): macFUSE or
//              FUSE-T on macOS, FUSE on Linux, WinFsp on Windows, where
//              aws.config names a renew.cmd wrapper because the SDK runs the
//              line through cmd.exe there.
//   - webdav → macOS `mount_webdav` against the Nexus WebDAV gateway. Nothing to
//              install, no kernel extension, and the server authorises every
//              request, so a revoked key stops the drive at once. macOS-only,
//              and `auto`'s fallback there.
//   - rclone → rclone mounting the same gateway over FUSE, the API key in its
//              environment. Server-authorised like webdav, and it works with a
//              raw --api-key. `auto`'s fallback on Linux and `auto` itself on
//              Windows (WinFsp); retired on macOS, where webdav and direct cover
//              everything it did.
//
// This module is what the engines and the verbs share. The engines are
// `workspace-mount-gateway.ts` (webdav, rclone) and `workspace-mount-direct.ts`;
// the four drive verbs are `workspace-mount.ts`, `workspace-remount.ts`,
// `workspace-unmount.ts` and `workspace-status.ts`; the CRUD verbs and the
// namespace are in `workspace.ts`.

/**
 * What `mount` settled before its first network call, by engine. A gateway
 * plan carries the engine and, for rclone, the binary its preflight probed and
 * the mount id its cache folder is named by; a direct plan carries that binary,
 * the mount id, the pins and the accepted credential_process line, so a
 * consumer that reads `mountId` has to prove the engine is `rclone` or
 * `direct` first.
 */
export type MountPlan = GatewaySettlement | ({ readonly engine: "direct" } & DirectPlan);
