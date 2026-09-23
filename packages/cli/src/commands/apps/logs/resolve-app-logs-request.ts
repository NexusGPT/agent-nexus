import { resolveLogWindow } from "../../../util/log-window";
import type { AppLogsFlags, AppLogsRequest } from "./app-logs-request";
import { VIBE_LOG_CLI_DEFAULT_SINCE } from "./log-limits";
import { parseColorFlag } from "./parse-color-flag";
import { parseGrepFlag } from "./parse-grep-flag";
import { parseLimitFlag } from "./parse-limit-flag";

/**
 * Flags → a request the endpoints will accept, or an `Error` naming what is
 * wrong with them.
 *
 * `now` is a parameter so the whole of this is testable without freezing a
 * clock. Everything it refuses is refused BEFORE any socket is opened: a local
 * message that names the flag beats a server 400 that names a field.
 */
export function resolveAppLogsRequest(flags: AppLogsFlags, now: number): AppLogsRequest {
  const follow = flags.follow === true;

  // Refused rather than resolved by precedence. Silently ignoring one of them
  // would leave a caller believing they had bounded a stream that is unbounded.
  if (follow && flags.until !== undefined) {
    throw new Error(
      "--follow cannot be combined with --until: a follow runs until you stop it, so it has no end instant. Drop one of the two."
    );
  }

  const window = resolveLogWindow(flags.since ?? VIBE_LOG_CLI_DEFAULT_SINCE, flags.until, now);

  return {
    from: window.from,
    to: follow ? undefined : window.to,
    color: parseColorFlag(flags.color),
    contains: parseGrepFlag(flags.grep),
    limit: parseLimitFlag(flags.limit),
    follow
  };
}
