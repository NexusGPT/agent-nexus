/**
 * THE UPDATE QUESTION — is a newer CLI published, and may this process act on it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT HOLDS ACROSS THE WHOLE MODULE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * · NOTHING on an automatic path waits on the network. Every automatic answer
 *   comes off `~/.nexus-mcp/version-check.json`, and a stale cache schedules a
 *   DETACHED child to refresh it for the next invocation —
 *   `version-check.refresh.ts` carries the measurement that says why an
 *   unawaited `fetch` relocates the wait instead of removing it.
 * · The opt-out lives BESIDE each side effect it governs, never at a call site.
 *   `version-check.check.ts` carries the defect that taught that: a gate in one
 *   arm of a two-arm `if` does not disable the behaviour, it picks which half
 *   of it you get.
 * · Nothing here throws, and nothing writes to stdout. This runs before every
 *   command on a CLI whose `--json` output must stay one parseable document.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHERE EACH PART LIVES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This file is the entry point and declares nothing of its own, so every
 * importer — and every `vi.mock("…/util/version-check")` already in this
 * package — keeps one module path while each concern stays its own file:
 *
 *   `.constants.ts`        the package name, the four durations, the two paths
 *   `.cache.ts`            the cache record, and the four ways it is touched
 *   `.lock.ts`             who owns a refresh, and the ceiling of that claim
 *   `.refresh-script.ts`   the detached child, as source, with its atomic write
 *   `.refresh.ts`          spawning that child, and the read-and-maybe-schedule
 *   `.semver.ts`           the three-part comparison
 *   `.messages.ts`         the two banners, and the SAME install command both name
 *   `.opt-out.ts`          `NEXUS_NO_AUTO_UPDATE` / `CI`, and what they govern
 *   `.fetch.ts`            the one path allowed to block — `nexus upgrade` asking
 *   `.check.ts`            the notice path
 *   `.derived-capture.ts`  🔴 the ONE copy of the capture flag, with its readers
 *   `.install-prefix.ts`   whether a global self-install could succeed at all
 *   `.auto-update.ts`      the install path, its backoff and its ceiling
 */

export { autoUpdate } from "./version-check.auto-update";
export { checkForUpdate } from "./version-check.check";
export {
  asDerivedCapture,
  isDerivedCapture,
  readCachedNewerVersion
} from "./version-check.derived-capture";
export { fetchLatestVersion } from "./version-check.fetch";
export { isInstallPrefixWritable } from "./version-check.install-prefix";
export { acquireRefreshLock } from "./version-check.lock";
export { formatAutoUpdateFailedMessage, formatUpdateMessage } from "./version-check.messages";
export { isAutoUpdateDisabled } from "./version-check.opt-out";
export { buildRefreshScript } from "./version-check.refresh-script";
export { compareSemver } from "./version-check.semver";
