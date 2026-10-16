import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { MountRecord } from "./mount-registry.model";
import { ensureSecretDir, writeSecretFile } from "./util/secret-file";

/**
 * WHERE THE REGISTRY FILE LIVES, AND HOW IT IS READ AND WRITTEN.
 *
 * `STATE_DIR` also holds `config.json`, the plaintext API key — so the mode of
 * that directory is decided by every route that can bring it into existence,
 * including the ones that write nothing secret themselves. That is what
 * {@link ensureStateSubdir} is for.
 */

export const STATE_DIR = path.join(os.homedir(), ".nexus-mcp");
export const STATE_FILE = path.join(STATE_DIR, "workspace-mounts.json");
export const LOG_DIR = path.join(STATE_DIR, "logs");

export function readMounts(): Record<string, MountRecord> {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as Record<string, MountRecord>;
  } catch {
    return {};
  }
}

export function writeMounts(mounts: Record<string, MountRecord>): void {
  writeSecretFile(STATE_FILE, JSON.stringify(mounts, null, 2) + "\n");
}

/**
 * Create `dir` under `STATE_DIR`, with BOTH at 0700 whether they existed or not.
 *
 * `STATE_DIR` is `~/.nexus-mcp` — the directory that also holds `config.json`,
 * the plaintext API key. So every route that can bring that directory into
 * existence decides the mode the credential file will sit behind, including the
 * ones that write nothing secret themselves. A bare
 * `mkdirSync(LOG_DIR, { recursive: true })` created it at the caller's umask,
 * and a create-time mode argument would not have helped on a directory that is
 * already there.
 */
export function ensureStateSubdir(dir: string): void {
  ensureSecretDir(STATE_DIR);
  if (dir !== STATE_DIR) ensureSecretDir(dir);
}
