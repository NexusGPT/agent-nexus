import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getGlobalInstallCommand, getGlobalUpdateHint } from "./package-manager";

const PACKAGE_NAME = "@agent-nexus/cli";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day
const FETCH_TIMEOUT_MS = 3_000; // don't slow down the CLI
// Resolved lazily (not at import time) so the home dir is read when the cache
// is actually used.
function getCacheFile(): string {
  return path.join(os.homedir(), ".nexus-mcp", "version-check.json");
}

interface VersionCache {
  lastChecked: number;
  latestVersion: string;
}

function loadCache(): VersionCache | null {
  try {
    return JSON.parse(fs.readFileSync(getCacheFile(), "utf-8")) as VersionCache;
  } catch {
    return null;
  }
}

function saveCache(cache: VersionCache): void {
  try {
    const file = getCacheFile();
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(cache), { mode: 0o600 });
  } catch {
    // Non-critical — silently ignore write failures
  }
}

export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const json = (await res.json()) as { version?: string };
    return json.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Compare two semver strings. Returns:
 *  -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Check if a newer version of the CLI is available.
 *
 * - Fires at most once per day (cached).
 * - Never blocks or throws — all failures are silently swallowed.
 * - Returns an update message if outdated, or null if up-to-date / check skipped.
 */
export async function checkForUpdate(currentVersion: string): Promise<string | null> {
  try {
    const cache = loadCache();

    // Skip if we checked recently
    if (cache && Date.now() - cache.lastChecked < CHECK_INTERVAL_MS) {
      if (compareSemver(currentVersion, cache.latestVersion) < 0) {
        return formatUpdateMessage(currentVersion, cache.latestVersion);
      }
      return null;
    }

    // Fetch in background — don't await if we can avoid blocking
    const latest = await fetchLatestVersion();
    if (!latest) return null;

    saveCache({ lastChecked: Date.now(), latestVersion: latest });

    if (compareSemver(currentVersion, latest) < 0) {
      return formatUpdateMessage(currentVersion, latest);
    }

    return null;
  } catch {
    return null;
  }
}

export function formatUpdateMessage(current: string, latest: string): string {
  return (
    `\n  Update available: ${current} → ${latest}\n` +
    `  Run "${getGlobalUpdateHint(PACKAGE_NAME)}" to update.\n`
  );
}

/**
 * One-line notice shown when a background auto-update could not complete
 * (e.g. EACCES on a root-owned global install dir). The command already ran
 * on the installed version, so this is informational — not a hard warning.
 */
export function formatAutoUpdateFailedMessage(latest: string): string {
  return `\n  Auto-update to ${latest} failed. Run "${getGlobalInstallCommand(PACKAGE_NAME)}" to update manually.\n`;
}

/**
 * Automatically update the CLI to the latest version.
 *
 * - Fires at most once per day (uses the same cache as checkForUpdate).
 * - Never throws — all failures are silently swallowed and fall back to a manual-update message.
 * - Returns a status message describing what happened.
 */
export async function autoUpdate(currentVersion: string): Promise<string | null> {
  let latest: string | null = null;
  try {
    const cache = loadCache();

    if (cache && Date.now() - cache.lastChecked < CHECK_INTERVAL_MS) {
      latest = cache.latestVersion;
    } else {
      latest = await fetchLatestVersion();
      if (latest) {
        saveCache({ lastChecked: Date.now(), latestVersion: latest });
      }
    }

    if (!latest || compareSemver(currentVersion, latest) >= 0) {
      return null; // up-to-date or unable to check
    }

    // Attempt the upgrade.
    // Capture (don't inherit) the installer's output: a failed background
    // update — e.g. EACCES on a root-owned global dir — must not dump a
    // multi-line npm error stack over the command's real output.
    const { execSync } = await import("node:child_process");
    process.stderr.write(`\n  Auto-updating: ${currentVersion} → ${latest}…\n`);
    execSync(getGlobalInstallCommand(PACKAGE_NAME), {
      stdio: ["ignore", "ignore", "pipe"]
    });
    return `\n  Successfully auto-updated to ${latest}.\n`;
  } catch {
    // Auto-update failed. The command already ran on the installed version,
    // so this is non-fatal — show a brief one-line notice, never the
    // alarming "MUST update / results may be incorrect" warning.
    return formatAutoUpdateFailedMessage(latest ?? loadCache()?.latestVersion ?? "latest");
  }
}
