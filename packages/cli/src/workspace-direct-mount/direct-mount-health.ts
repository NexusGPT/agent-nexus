import { checkRefreshPath } from "./check-refresh-path";
import { countPendingUploads } from "./count-pending-uploads";
import { readSession } from "./read-session";
import { REFRESH_FAILURE_TABLE } from "./refresh-failure-table";
import type { RefreshVerdict } from "./refresh-verdict";
import { remountFix } from "./remount-fix";
import { sessionPathsFor } from "./session-paths";

export interface DirectMountHealth {
  readonly verdict: RefreshVerdict;
  /** Null when the session file cannot be read. */
  readonly expiresAt: string | null;
  readonly pendingUploads: number;
}

export interface DirectMountHealthInput {
  readonly mountId: string;
  readonly slug: string;
  /** Whether `config.json` still holds the named profile — the helper's key source. */
  readonly profileExists: (name: string) => boolean;
  readonly now: Date;
}

/**
 * What `status` says about a direct mount's renewal, from LOCAL reads only:
 * the session file's `expiresAt` and `lastRefresh`, the two paths the
 * `aws.config` line names, and the profile's presence in `config.json`. Never
 * a network call — the server is not consulted, and the column says what THIS
 * machine can prove.
 *
 * The ladder: a broken refresh path outranks everything (no renewal can run at
 * all), a recorded failure outranks staleness (it says WHY the next click will
 * fail), and an expired session with no failure recorded is merely stale — the
 * next click renews it.
 */
export function directMountHealth(input: DirectMountHealthInput): DirectMountHealth {
  const paths = sessionPathsFor(input.mountId);
  const pendingUploads = countPendingUploads(paths.cacheDir);
  const read = readSession(input.mountId);
  if (!read.ok) {
    const state = read.why === "missing" ? "missing" : "unreadable";
    return {
      verdict: {
        kind: "broken",
        what: `${paths.sessionFile} ${state}`,
        fix: remountFix(input.slug)
      },
      expiresAt: null,
      pendingUploads
    };
  }
  const { session } = read;
  const health = (verdict: RefreshVerdict): DirectMountHealth => ({
    verdict,
    expiresAt: session.expiresAt,
    pendingUploads
  });
  if (!input.profileExists(session.profile)) {
    return health({
      kind: "broken",
      what: `profile "${session.profile}" missing from config.json`,
      fix: `nexus auth login --profile ${session.profile}`
    });
  }
  const probe = checkRefreshPath(session);
  if (!probe.ok)
    return health({ kind: "broken", what: probe.problem, fix: remountFix(input.slug) });
  const last = session.lastRefresh;
  if (last !== undefined && last.outcome === "failed") {
    const row = REFRESH_FAILURE_TABLE[last.reason];
    return health({
      kind: "failed",
      at: last.at,
      reason: last.reason,
      transient: row.transient,
      fix: row.statusHint({ slug: input.slug, profile: session.profile })
    });
  }
  // 🔴 UNREADABLE IS NOT VALID. `isMountSession` checks `expiresAt` is a string
  // and not that it is an instant, so `""` or a truncated ISO stamp yields NaN —
  // and `NaN <= now` is FALSE, which fell through to `ok` and exited 0 for a
  // drive whose expiry nobody can read. `isFresh` already fails safe on the same
  // field, so the two readers of one value disagreed about which way to fail.
  // A `broken` verdict, not `stale`: staleness heals on the next click, and this
  // does not — the file has to be rewritten.
  const expiresAt = new Date(session.expiresAt).getTime();
  if (Number.isNaN(expiresAt)) {
    return health({
      kind: "broken",
      what: `${sessionPathsFor(input.mountId).sessionFile} records an unreadable expiry`,
      fix: remountFix(input.slug)
    });
  }
  if (expiresAt <= input.now.getTime()) {
    return health({ kind: "stale", expiredAt: session.expiresAt });
  }
  return health({ kind: "ok", at: last?.at ?? session.mintedAt });
}
