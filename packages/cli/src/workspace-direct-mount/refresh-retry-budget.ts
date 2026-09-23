/**
 * The wall-clock budget for one helper run's backend attempts.
 *
 * rclone's AWS SDK kills `credential_process` at 60 s (processcreds
 * `DefaultTimeout`), and a kill lands before the outcome is recorded — no
 * `lastRefresh`, no cooldown, no notification, and the next S3 request hangs
 * for the same minute again. So every attempt must END inside this budget,
 * leaving the rest of the minute for node's start-up, the record and the
 * document.
 */
export const REFRESH_BUDGET_MS = 45 * 1000;

/** Attempts against a transient failure — wake-from-sleep Wi-Fi lag, nothing else. */
export const REFRESH_ATTEMPTS = 3;

/** The pause between two attempts. */
export const REFRESH_RETRY_DELAY_MS = 2000;

/**
 * May one more attempt start after `attempt` failed?
 *
 * Only while the next one would end inside {@link REFRESH_BUDGET_MS}: the
 * pause before it plus the client's own timeout, on top of what has elapsed.
 * The attempt count is a ceiling for failures that come back at once (a
 * refused connection); the budget is the bound for ones that hang until the
 * client gives up (a backend that accepts TCP and never answers).
 */
export function refreshMayRetry(input: {
  readonly attempt: number;
  readonly elapsedMs: number;
  readonly timeoutMs: number;
}): boolean {
  if (input.attempt >= REFRESH_ATTEMPTS) return false;
  return input.elapsedMs + REFRESH_RETRY_DELAY_MS + input.timeoutMs <= REFRESH_BUDGET_MS;
}
