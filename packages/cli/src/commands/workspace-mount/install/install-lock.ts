import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { failure } from "../../../errors";
import { ensureStateSubdir } from "../../../mount-registry";
import { MANAGED_RCLONE_DIR } from "../../../workspace-direct-mount/managed-rclone";
import { releasingOnSignal } from "./release-on-signal";

/** A directory, because `mkdir` is the one filesystem call that is atomic and fails when the name exists. */
export const INSTALL_LOCK_DIR = path.join(MANAGED_RCLONE_DIR, ".install-lock");

/** Inside the lock: the token of the run that holds it, so a run releases only its own. */
const OWNER_FILE = "owner";

/**
 * A lock older than this belongs to a run that died holding it and is taken
 * over; a 30 MB download plus a password prompt fits well inside.
 *
 * debt: a live transfer slower than ~17 KB/s outlives this TTL and a second
 *       mount takes over mid-install — harmless for the rclone zip, a second
 *       sudo prompt on the pkg road. Refresh the lock's mtime on each chunk
 *       when a double install is reported.
 */
export const INSTALL_LOCK_TTL_MS = 30 * 60 * 1000;

/**
 * One installer at a time on this machine: two mounts that both find rclone
 * missing would download twice, sweep each other's stage, and put two `sudo`
 * prompts on one terminal. The second is refused, naming the lock's path.
 *
 * The lock holds a per-run token: release removes it only while the token is
 * still ours, so a run whose lock was taken over never deletes its successor's.
 * Ctrl-C and SIGTERM release it too, then the signal is raised again so the
 * process ends exactly as it would have — a killed install must not leave a
 * fresh lock that refuses every mount for the next half hour.
 */
export async function withInstallLock<T>(
  fn: () => Promise<T>,
  now: () => number = Date.now
): Promise<T> {
  ensureStateSubdir(MANAGED_RCLONE_DIR);
  const token = `${process.pid}-${randomUUID()}`;
  if (!acquire(token, now())) {
    throw failure(
      "local-failed",
      "Another nexus mount is installing prerequisites on this machine right now.",
      `Wait for it to finish, then mount again. If no other mount is running, remove ${INSTALL_LOCK_DIR}.`
    );
  }
  try {
    return await releasingOnSignal(() => release(token), fn);
  } finally {
    release(token);
  }
}

function acquire(token: string, nowMs: number): boolean {
  if (claim(token)) return true;
  const holder = ownerOf(INSTALL_LOCK_DIR);
  let heldSince: number;
  try {
    heldSince = fs.statSync(INSTALL_LOCK_DIR).mtimeMs;
  } catch {
    return claim(token); // released between the mkdir and the stat
  }
  if (nowMs - heldSince < INSTALL_LOCK_TTL_MS) return false;
  return takeOver(token, holder);
}

/** `mkdir` decides; any failure but EEXIST is not "held" and says what it is. */
function claim(token: string): boolean {
  try {
    fs.mkdirSync(INSTALL_LOCK_DIR);
  } catch (error) {
    const code = errnoOf(error);
    if (code === "EEXIST") return false;
    throw failure(
      "local-failed",
      `The install lock ${INSTALL_LOCK_DIR} could not be created (${code ?? String(error)}).`,
      `Check that ${MANAGED_RCLONE_DIR} belongs to you and is writable, then mount again.`
    );
  }
  try {
    fs.writeFileSync(path.join(INSTALL_LOCK_DIR, OWNER_FILE), token);
  } catch (error) {
    // An ownerless lock (disk full) would refuse every install for 30 minutes.
    fs.rmSync(INSTALL_LOCK_DIR, { recursive: true, force: true });
    throw error;
  }
  return true;
}

/**
 * Take a stale lock by RENAME, then prove the moved lock is the stale one: two
 * runs can both read it as stale, and the second's rename would move the FRESH
 * lock the first just made. A token mismatch is handed back; a match is swept.
 *
 * debt: a third run that mkdirs between our rename and the hand-back makes
 *       the hand-back fail, and the first taker's lock is gone while it runs.
 *       Three runs inside one rename; revisit if a double install is reported.
 */
function takeOver(token: string, staleHolder: string | null): boolean {
  const grave = `${INSTALL_LOCK_DIR}.stale-${token}`;
  if (!moved(INSTALL_LOCK_DIR, grave)) return false; // another taker moved it first
  if (ownerOf(grave) !== staleHolder) {
    moved(grave, INSTALL_LOCK_DIR); // hand it back; a failure is the debt above
    return false;
  }
  fs.rmSync(grave, { recursive: true, force: true });
  return claim(token);
}

function moved(from: string, to: string): boolean {
  try {
    fs.renameSync(from, to);
    return true;
  } catch {
    return false;
  }
}

function release(token: string): void {
  if (ownerOf(INSTALL_LOCK_DIR) !== token) return; // taken over while we ran: not ours to delete
  fs.rmSync(INSTALL_LOCK_DIR, { recursive: true, force: true });
}

function ownerOf(lockDir: string): string | null {
  try {
    return fs.readFileSync(path.join(lockDir, OWNER_FILE), "utf-8");
  } catch {
    return null;
  }
}

function errnoOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
