import os from "node:os";
import path from "node:path";

import { STATE_DIR } from "../../../mount-registry";

/** This boot, in whole minutes since the epoch: the same for every process until the machine restarts. */
function bootMinute(): number {
  return Math.floor((Date.now() - os.uptime() * 1000) / 60_000);
}

/**
 * The file a WinFsp install that asked for a restart (3010, 1641) leaves,
 * named for this boot. A restart changes the boot, so the name no longer
 * matches and the mount goes ahead; before it, rclone must not start against a
 * half-replaced driver.
 */
export function winFspRestartMarker(minute: number = bootMinute()): string {
  return path.join(STATE_DIR, `winfsp-restart-pending-${String(minute)}`);
}

/** Whether this boot's marker exists; a minute either side absorbs the rounding of two reads of the uptime. */
export function winFspRestartPending(exists: (file: string) => boolean): boolean {
  const minute = bootMinute();
  return [minute - 1, minute, minute + 1].some((m) => exists(winFspRestartMarker(m)));
}
