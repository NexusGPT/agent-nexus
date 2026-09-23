import fs from "node:fs";

import { ensureStateSubdir } from "../mount-registry";
import { writeSecretFile } from "../util/secret-file";
import type { MountSession } from "./mount-session";
import { MOUNT_CREDENTIALS_DIR, sessionPathsFor } from "./session-paths";

/**
 * Write a mount's session at 0600, ATOMICALLY: the bytes land in a sibling
 * temp file through `writeSecretFile` and are renamed over the live one, so a
 * helper killed mid-write (rclone's AWS SDK kills it at 60 s) leaves the
 * previous session intact rather than a truncated file every later run reads
 * as malformed. The rename keeps the temp file's mode.
 */
export function writeSession(session: MountSession): void {
  const paths = sessionPathsFor(session.mountId);
  ensureStateSubdir(MOUNT_CREDENTIALS_DIR);
  const temp = `${paths.sessionFile}.${process.pid}.tmp`;
  writeSecretFile(temp, JSON.stringify(session, null, 2) + "\n");
  fs.renameSync(temp, paths.sessionFile);
}
