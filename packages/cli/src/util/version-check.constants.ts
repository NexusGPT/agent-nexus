import os from "node:os";
import path from "node:path";

export const PACKAGE_NAME = "@agent-nexus/cli";
export const REGISTRY_LATEST_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day
export const FETCH_TIMEOUT_MS = 3_000; // don't slow down the CLI
// A failed install attempt is close to permanent (EACCES on a root-owned
// prefix, broken npm) — don't re-run the blocking install on every invocation.
export const FAILURE_BACKOFF_MS = 24 * 60 * 60 * 1000; // 1 day
// Hard ceiling on how long a self-install may hold up process exit.
export const INSTALL_TIMEOUT_MS = 60_000;
// How long one refresh may hold the lock before another invocation may take it
// over. Long enough to cover a slow-but-alive fetch, short enough that a killed
// refresher does not suppress the next one for a noticeable time.
export const REFRESH_LOCK_TTL_MS = 60_000;

// Resolved lazily (not at import time) so the home dir is read when the cache
// is actually used.
export function getCacheFile(): string {
  return path.join(os.homedir(), ".nexus-mcp", "version-check.json");
}

export function getRefreshLockDir(): string {
  return path.join(os.homedir(), ".nexus-mcp", "version-check.lock");
}
