import type { WorkspaceMountAccess } from "@agent-nexus/sdk";

/**
 * WHAT A RECORDED MOUNT IS.
 *
 * Types and the engine tables only — `mount-registry.ts` carries what the
 * registry is for and why it is keyed the way it is.
 */

/**
 * How a recorded mount is served. `webdav` and `rclone` both speak WebDAV to
 * the gateway — the native macOS client and rclone over FUSE on Linux and
 * Windows; `direct` is rclone signing S3 requests itself with a one-hour
 * credential the CLI refreshes through `workspace credential-process`. Which
 * one `auto` picks per platform is `platform-rules.ts`'s table.
 * The one list every engine gate and table derives from.
 */
export const ENGINES = ["webdav", "rclone", "direct"] as const;
export type Engine = (typeof ENGINES)[number];

/**
 * How a recorded mount's liveness is probed: by signalling the detached
 * process it recorded, or by reading the OS mount table. Keyed exhaustively
 * on `Engine` so a new engine cannot default to the wrong probe.
 */
export const ENGINE_LIVENESS = {
  webdav: "mount-table",
  rclone: "pid",
  direct: "pid"
} as const satisfies Record<Engine, "pid" | "mount-table">;

/**
 * The engines that spawn rclone, so the preflight and its message speak of the
 * one the caller actually asked for. Derived, so a fourth engine cannot join
 * the pair by being spelled into a second list.
 */
export type RcloneEngine = Extract<Engine, "rclone" | "direct">;

/** The access a direct-engine mount was granted, as the server graded it — the SDK's own grade type. */
export type MountAccess = WorkspaceMountAccess;

/**
 * One recorded mount.
 *
 * 🚨 NO BUCKET, PREFIX, REGION OR CREDENTIAL FIELD. `workspace status --json`
 * projects a fixed field set from these records, so what reaches a script's
 * stdout is decided at that projection — and a projection can only print what
 * the row holds. Keeping storage names out of the row means no field added to
 * the projection can leak one. The direct engine keeps what rclone needs in
 * the mount's own owner-only session file and in the rclone process env; the
 * registry row carries only what `status`, `unmount` and a later mount of the
 * same workspace need to find them again.
 */
export interface MountRecord {
  slug: string;
  engine: Engine;
  mountPath: string;
  baseUrl: string;
  /**
   * The per-mount id of the engines that cache: the first 16 hex digits of the
   * sha256 of the registry key, so one org + slug always maps to one rclone
   * cache directory (and, on the direct engine, one session directory) across
   * remounts. Absent on the webdav engine, and on an rclone row mounted before
   * drives had their own cache folder.
   */
  mountId?: string;
  /** The access the server GRANTED at mint time. Direct engine only. */
  access?: MountAccess;
  /** True when the admin-shared workspace was mounted (via `--shared`), not the
   *  same-slug org-owned one. Absent on records written before NEX-2362. */
  shared?: boolean;
  /** Immutable id of the mounted workspace, when resolved from the list. */
  workspaceId?: string;
  /** True when read-only was ASKED FOR (`--read-only`, or a CODE kind). Absent on
   *  records written before NEX-2372 — mode was unobservable until a write
   *  failed. The effective mode of a direct row also reads `access`: a `read`
   *  grant makes the drive read-only whatever was asked, and `remount` asks for
   *  this flag again rather than replaying the grant. */
  readOnly?: boolean;
  /** Present only for the engines that spawn rclone; native WebDAV has no tracked process. */
  pid?: number;
  mountedAt: string;
  /** Acting org pinned at mount time (absent on legacy pre-NEX-2360 entries,
   *  and on mounts made with a raw --api-key that resolved no org). */
  orgId?: string;
  orgName?: string;
  /** Name of the profile that mounted this; absent for --api-key overrides. */
  profile?: string;
}

/** The org/profile a mount belongs to, used to namespace the registry key. */
export interface MountScope {
  profile?: string;
  orgId?: string;
  orgName?: string;
  baseUrl: string;
}
