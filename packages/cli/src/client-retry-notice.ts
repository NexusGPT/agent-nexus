import type { RetryNotice } from "@agent-nexus/sdk";

import { color } from "./output";

/**
 * Tell the user that a slow command is WAITING rather than hung.
 *
 * ⚠️ STDERR, and never stdout. `--json` promises exactly one parseable document
 * on stdout, so a progress line written there would corrupt every piped
 * consumer — which is the reason this is not gated on `isJsonMode()` either. A
 * retry notice is diagnostic output, and diagnostic output belongs on stderr in
 * both modes: suppressing it under `--json` would leave the one caller most
 * likely to be running unattended in a script with no explanation for a forty
 * second command.
 *
 * The wait is named as the server's or as ours, because the two mean different
 * things to whoever is watching: a `Retry-After` is a rate limit that will clear
 * on a schedule, while a backoff is the client guessing at a flapping upstream.
 *
 * Wired as `createClient`'s `onRetry`. Exported beyond that only so
 * `retry-notice-goes-to-stderr.test.ts` can assert the stream it writes to.
 */
export function reportRetryOnStderr(notice: RetryNotice): void {
  const waited = `${Math.round(notice.delayMs / 100) / 10}s`;
  const cause = notice.status === undefined ? "connection failed" : `HTTP ${notice.status}`;
  const source = notice.statedByServer ? "requested by the server" : "backoff";

  process.stderr.write(
    color.dim(
      `  Retrying in ${waited} — ${cause}, ${source} ` +
        `(attempt ${notice.attempt + 1} of ${notice.maxAttempts})\n`
    )
  );
}
