import { InvalidArgumentError } from "commander";

import { MAX_TIMEOUT_SECONDS, type Seconds, seconds } from "./timeout-seconds";

/**
 * Parse the global `--timeout <seconds>` flag. Accepts any positive number of
 * seconds (fractions allowed); rejects everything else at parse time so a typo
 * fails fast instead of silently falling back to the default timeout.
 */
export function parseTimeoutSeconds(raw: string): Seconds {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("--timeout must be a positive number of seconds.");
  }
  if (parsed > MAX_TIMEOUT_SECONDS) {
    throw new InvalidArgumentError(
      `--timeout must be at most ${MAX_TIMEOUT_SECONDS} seconds; a longer timer overflows ` +
        `Node's 32-bit delay and aborts the request immediately instead of waiting.`
    );
  }
  // Minted through the helper rather than cast, so `seconds()` stays the ONE
  // construction site for the brand. The local was called `seconds` and shadowed
  // it, which is what forced a second cast here.
  return seconds(parsed);
}
