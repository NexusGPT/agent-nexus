import { getGlobalInstallCommand } from "./package-manager";
import { firstNonBlankOr } from "./present-text";
import { clearFailedAttempt, loadCache, recordFailedAttempt } from "./version-check.cache";
import { FAILURE_BACKOFF_MS, INSTALL_TIMEOUT_MS, PACKAGE_NAME } from "./version-check.constants";
import { isInstallPrefixWritable } from "./version-check.install-prefix";
import { formatAutoUpdateFailedMessage } from "./version-check.messages";
import { isAutoUpdateDisabled } from "./version-check.opt-out";
import { readCacheAndScheduleRefresh } from "./version-check.refresh";
import { compareSemver } from "./version-check.semver";

/**
 * Automatically update the CLI to the latest version.
 *
 * - Reads the version from the cache and NEVER waits on the network; a stale
 *   cache schedules a detached refresh for the next invocation, exactly as
 *   `checkForUpdate` does and through the same helper.
 * - Never attempts an install that cannot succeed: skips when the install
 *   prefix isn't writable, and backs off for FAILURE_BACKOFF_MS after any
 *   failed attempt instead of re-running the blocking install per invocation.
 * - The install itself is bounded by INSTALL_TIMEOUT_MS.
 * - Never throws — all failures are silently swallowed and fall back to a manual-update message.
 * - Does nothing at all when {@link isAutoUpdateDisabled} — no install, and no
 *   network lookup either.
 * - Returns a status message describing what happened.
 */
export async function autoUpdate(currentVersion: string): Promise<string | null> {
  // Beside the side effect, for the reason `checkForUpdate` documents at
  // length. `root-run-cli.ts` tests the same predicate, and that is NOT a duplicate of
  // this line: there it selects a BRANCH (install, or fall through to the
  // notice), so deleting it would suppress the notice too. This line is the
  // guarantee that no caller — present or future — can start an install the
  // environment has refused.
  if (isAutoUpdateDisabled()) return null;

  let latest: string | null = null;
  try {
    // Same contract as `checkForUpdate`: decide from the cache, schedule the
    // refresh for the next run. A self-install is a heavier side effect than a
    // notice, so acting one invocation later is if anything the safer half of
    // this trade — it never installs on the strength of a number the user has
    // not already been shown.
    const cache = readCacheAndScheduleRefresh();
    latest = cache?.latestVersion ?? null;

    if (!latest || compareSemver(currentVersion, latest) >= 0) {
      return null; // up-to-date or unable to check
    }

    // A recent attempt at this same version already failed — the condition is
    // effectively permanent (EACCES prefix), so don't retry within the TTL.
    if (
      cache?.failedVersion === latest &&
      typeof cache.failedAt === "number" &&
      Date.now() - cache.failedAt < FAILURE_BACKOFF_MS
    ) {
      return formatAutoUpdateFailedMessage(latest);
    }

    // If the install prefix isn't writable by this user the install can never
    // succeed — skip the attempt (one syscall) and hint at a manual update.
    if (!isInstallPrefixWritable()) {
      recordFailedAttempt(latest);
      return formatAutoUpdateFailedMessage(latest);
    }

    // Mark the attempt as failed up-front so an interrupted install (Ctrl-C
    // mid-npm) still backs off; cleared on success.
    recordFailedAttempt(latest);

    // Attempt the upgrade.
    // Capture (don't inherit) the installer's output: a failed background
    // update — e.g. EACCES on a root-owned global dir — must not dump a
    // multi-line npm error stack over the command's real output.
    const { execSync } = await import("node:child_process");
    process.stderr.write(`\n  Auto-updating: ${currentVersion} → ${latest}…\n`);
    execSync(getGlobalInstallCommand(PACKAGE_NAME), {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: INSTALL_TIMEOUT_MS
    });
    clearFailedAttempt();
    return `\n  Successfully auto-updated to ${latest}.\n`;
  } catch {
    // Auto-update failed. The command already ran on the installed version,
    // so this is non-fatal — show a brief one-line notice, never the
    // alarming "MUST update / results may be incorrect" warning.
    if (latest) recordFailedAttempt(latest);
    return formatAutoUpdateFailedMessage(
      firstNonBlankOr([latest, loadCache()?.latestVersion], "latest")
    );
  }
}
