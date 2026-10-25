import fs from "node:fs";

import { ensureStateSubdir } from "../mount-registry";
import { writeSecretFile } from "../util/secret-file";
import { errnoOf } from "./errno-of";
import type { MountSession } from "./mount-session";
import { MOUNT_CREDENTIALS_DIR, sessionPathsFor } from "./session-paths";

const RENAME_ATTEMPTS = 10;
const RENAME_RETRY_DELAY_MS = 100;

/**
 * Write a mount's session at 0600, whole or not at all — see
 * {@link writeSecretFileAtomically}: a helper killed mid-write (rclone's AWS SDK
 * kills it at 60 s) leaves the previous session intact rather than a truncated
 * file every later run reads as malformed.
 */
export function writeSession(session: MountSession): void {
  ensureStateSubdir(MOUNT_CREDENTIALS_DIR);
  const file = sessionPathsFor(session.mountId).sessionFile;
  writeSecretFileAtomically(file, JSON.stringify(session, null, 2) + "\n");
}

/**
 * Write a secret-bearing file WHOLE OR NOT AT ALL: the bytes land in a sibling
 * temp file through `writeSecretFile` (0600, directory 0700) and are renamed
 * over the live one, so a process that dies mid-write leaves the previous file
 * untouched instead of a truncated one. The rename keeps the temp file's mode.
 * On Windows an antivirus or the indexer can hold the fresh temp file or the
 * target for a moment, so a rename refused with EPERM or EBUSY is tried again,
 * a bounded number of times. The direct mount's `session.json`, `aws.config`
 * and `renew.cmd` all go through here.
 */
export function writeSecretFileAtomically(file: string, contents: string): void {
  const temp = `${file}.${process.pid}.tmp`;
  // debt: on Windows chmod sets only the read-only bit, so 0600/0700 protect nothing there;
  //       the folder rides on the profile's inherited ACL — set an owner-only ACL if shared machines matter.
  writeSecretFile(temp, contents);
  try {
    renameWhileHeld(temp, file);
  } catch (error) {
    // The temp file holds the same secret: it never outlives a failed rename.
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

/** `fs.renameSync`, tried `RENAME_ATTEMPTS` times while Windows refuses it with EPERM or EBUSY; the last error is thrown. */
export function renameWhileHeld(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      const code = errnoOf(error);
      if ((code !== "EPERM" && code !== "EBUSY") || attempt >= RENAME_ATTEMPTS) throw error;
      // The helper is synchronous end to end, so the wait is too.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_RETRY_DELAY_MS);
    }
  }
}
