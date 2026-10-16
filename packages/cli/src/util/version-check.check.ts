import { loadCache } from "./version-check.cache";
import { messageIfNewer } from "./version-check.messages";
import { isAutoUpdateDisabled } from "./version-check.opt-out";
import { readCacheAndScheduleRefresh } from "./version-check.refresh";

/**
 * Check if a newer version of the CLI is available.
 *
 * - Answers from the cache. NEVER waits on the network — a stale cache schedules
 *   a detached refresh for the next invocation; see `scheduleCacheRefresh` in
 *   `version-check.refresh.ts` for why an unawaited fetch relocates the wait
 *   instead of removing it.
 * - Refreshes at most once per day, and at most once per `REFRESH_LOCK_TTL_MS`
 *   while the registry is unreachable.
 * - Never throws — all failures are silently swallowed.
 * - Returns an update message if outdated, or null if up-to-date / check skipped.
 *
 * ── THE OPT-OUT IS ENFORCED HERE, NOT AT THE CALL SITE ──────────────────────
 *
 * 🚨 `root-run-cli.ts` chooses between "install on exit" and "print a notice"
 * with one `if`, and `isAutoUpdateDisabled()` was a term in the FIRST branch
 * only. So
 * the documented escape hatch selected the OTHER branch — and that branch was
 * the one holding the network call. A gate that sits in one arm of a two-arm
 * decision does not disable the behaviour; it picks which half of it you get.
 *
 * The cure is that the gate lives beside the side effect it governs. A future
 * caller of this function inherits it by construction and cannot forget it,
 * which a second copy of the condition at a second call site could not promise.
 *
 * The refusal is NARROW ON PURPOSE: it removes the REQUEST, never the NOTICE.
 * `NEXUS_NO_AUTO_UPDATE` is documented as "ignore `--auto-update`, print the
 * notice instead", and a user who is already told about 0.30.0 on disk is still
 * told about it. Only the lookup that would refresh that number is skipped —
 * so this reads exactly like a cache that is always fresh.
 *
 * `nexus upgrade` is unaffected: it calls `fetchLatestVersion`
 * (`version-check.fetch.ts`) directly,
 * because an explicit upgrade command is the user asking rather than the CLI
 * deciding. Gating the fetch itself would have broken the one path that is
 * supposed to reach the network under this variable.
 */
export async function checkForUpdate(currentVersion: string): Promise<string | null> {
  try {
    // Under the opt-out nothing is scheduled at all — a detached child making an
    // unasked-for registry request is exactly what the variable refuses, and it
    // would be a worse offence than the blocking one because it also survives
    // the command that started it.
    const cache = isAutoUpdateDisabled() ? loadCache() : readCacheAndScheduleRefresh();

    return cache === null ? null : messageIfNewer(currentVersion, cache.latestVersion);
  } catch {
    return null;
  }
}
