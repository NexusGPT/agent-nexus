import fs from "node:fs";

import type { MountSession } from "./mount-session";
import { readSession } from "./read-session";
import { sessionPathsFor } from "./session-paths";

/**
 * Delete the session directory only while it still holds THE session this run
 * wrote. Two `mount` invocations of one workspace share a mount id; the second
 * fails on the busy mount point, and an unconditional delete here would take
 * the first mount's key with it. A different key in the file means another
 * mount owns the directory now, and it is left alone.
 *
 * 🔴 ONLY a session that reads back and MATCHES authorises the delete. An
 * absent file is ours to clean; a MALFORMED one is not. A partially written
 * session is exactly what a concurrent mount produces — the reason the write is
 * atomic — so reading "malformed" as "mine" would let the run that lost the race
 * delete the winner's live credential, and that drive would stop renewing at its
 * next hour. Neither missing nor damaged is proof of ownership, so only a match
 * is taken as one.
 */
export function removeOwnSession(mountId: string, own: MountSession): void {
  const current = readSession(mountId);
  const ours = current.ok
    ? current.session.credentials.accessKeyId === own.credentials.accessKeyId
    : current.why === "missing";
  if (ours) fs.rmSync(sessionPathsFor(mountId).dir, { recursive: true, force: true });
}
