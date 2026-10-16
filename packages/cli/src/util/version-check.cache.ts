import fs from "node:fs";

import { writeSecretFile } from "./secret-file";
import { getCacheFile } from "./version-check.constants";

export interface VersionCache {
  lastChecked: number;
  latestVersion: string;
  /** Version a self-install attempt failed for; retries suppressed for FAILURE_BACKOFF_MS. */
  failedVersion?: string;
  failedAt?: number;
}

export function loadCache(): VersionCache | null {
  try {
    return JSON.parse(fs.readFileSync(getCacheFile(), "utf-8")) as VersionCache;
  } catch {
    return null;
  }
}

export function saveCache(cache: VersionCache): void {
  try {
    // `~/.nexus-mcp` also holds `config.json`, the plaintext API key. This cache
    // carries no secret of its own, but it is one of the routes that CREATES
    // that directory, so it decides the mode the credential file sits behind.
    writeSecretFile(getCacheFile(), JSON.stringify(cache));
  } catch {
    // Non-critical — silently ignore write failures
  }
}

export function recordFailedAttempt(version: string): void {
  const cache = loadCache() ?? { lastChecked: 0, latestVersion: version };
  saveCache({ ...cache, failedVersion: version, failedAt: Date.now() });
}

export function clearFailedAttempt(): void {
  const cache = loadCache();
  if (!cache) return;
  saveCache({ lastChecked: cache.lastChecked, latestVersion: cache.latestVersion });
}
