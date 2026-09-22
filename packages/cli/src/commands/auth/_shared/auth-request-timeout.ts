/**
 * The deadline an `auth` round-trip gets when `--timeout` is not given.
 * MILLISECONDS.
 *
 * A DEFAULT, never a ceiling — every site that reads it does so as
 * `timeoutSecondsToMs(timeoutSeconds) ?? AUTH_REQUEST_DEFAULT_TIMEOUT_MS`, so
 * the global `--timeout <seconds>` moves it. Four sites across the `auth` tree
 * pinned `AbortSignal.timeout(30_000)` instead, which made the CLI's own advice
 * to raise `--timeout` a false instruction on every one of them — the same
 * defect `docs.ts` carried, reached from four more places.
 *
 * Named `*_MS` on purpose: `AbortSignal.timeout` takes MILLISECONDS, and
 * `timeout-values-carry-their-unit.test.ts` enforces that a millisecond slot is
 * fed either `timeoutSecondsToMs(...)` or a `*_MS` constant.
 *
 * One constant for the tree rather than one per file, because these are all the
 * same round trip against the same known-fast endpoints, and a reader asking
 * "how long does `auth` wait" should find one answer.
 */
export const AUTH_REQUEST_DEFAULT_TIMEOUT_MS = 30_000;
