import path from "node:path";

import { STATE_DIR } from "../mount-registry";
import { isMountId } from "./mount-id";

// ── Direct-engine mount: the pure half ────────────────────────────────────────
//
// The direct engine is rclone signing S3 requests itself with a one-hour STS
// session the CLI mints from the API key. Everything rclone needs to find that
// session, and everything the `workspace credential-process` helper needs to
// renew it, lives in ONE owner-only directory per mount:
//
//   ~/.nexus-mcp/mount-credentials/<mountId>/session.json   the triplet + pins
//   ~/.nexus-mcp/mount-credentials/<mountId>/aws.config     the credential_process line
//   ~/.nexus-mcp/cache/<mountId>/                            rclone's VFS cache
//
// The mount id is a function of the registry key, so `mount`, `remount` and the
// helper all find the same three paths — and rclone, restarted with the same
// cache directory and the same remote definition, drains the saves a dead mount
// left behind.
//
// Every file in this directory is spawn-free and reads no environment of its
// own: each function takes what it needs as a parameter, so
// `mount-registry.test.ts` can pin any one of them without a FUSE, a network or
// a real home directory. The command files own the spawns, the clock and the
// exit codes.

/** Where every direct mount keeps its session and credential_process config. */
export const MOUNT_CREDENTIALS_DIR = path.join(STATE_DIR, "mount-credentials");

/** Where rclone keeps a direct mount's VFS cache — under the 0700 state tree. */
export const MOUNT_CACHE_DIR = path.join(STATE_DIR, "cache");

/**
 * Written the first time this machine mounts a direct drive, so the note about
 * allowing Terminal's notifications prints once rather than on every mount.
 */
export const DIRECT_MOUNT_INTRO_MARKER = path.join(STATE_DIR, "direct-mount-intro");

export interface SessionPaths {
  readonly dir: string;
  readonly sessionFile: string;
  readonly awsConfigFile: string;
  readonly cacheDir: string;
  /** Which copy of the slug the cache belongs to — see {@link cacheProvenanceRefusal}. */
  readonly cacheOwnerFile: string;
}

/**
 * The five paths one mount owns. `mountId` is CHECKED here rather than trusted,
 * because two of these paths are handed to `fs.rmSync(…, { recursive: true,
 * force: true })` and one of the callers reads the id out of
 * `workspace-mounts.json` — a file `readMounts` parses and casts, so the
 * `mountId: string` on `MountRecord` is a claim about a JSON file, not a fact.
 * A row carrying `../../..` would resolve those deletes outside the state
 * directory. This is the same guard, for the same reason, that
 * `assertMountableSlug` already applies to a slug before it reaches `path.join`.
 */
export function sessionPathsFor(mountId: string): SessionPaths {
  if (!isMountId(mountId)) {
    throw new Error(
      `Refusing to use "${mountId}" as a mount id: it is not 16 hex digits, so the registry row ` +
        "is corrupt. Check it with: nexus workspace status"
    );
  }
  const dir = path.join(MOUNT_CREDENTIALS_DIR, mountId);
  const cacheDir = path.join(MOUNT_CACHE_DIR, mountId);
  return {
    dir,
    sessionFile: path.join(dir, "session.json"),
    awsConfigFile: path.join(dir, "aws.config"),
    cacheDir,
    cacheOwnerFile: path.join(cacheDir, "owner.json")
  };
}
