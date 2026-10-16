/**
 * THE EXIT-CODE VOCABULARY. THE NAMES, WITHOUT THE NUMBERS.
 *
 * Declared apart from `exit-codes.ts` so that a module which only needs to NAME
 * a category — a signature, a `Record` key, a thrown error's field — does not
 * read the map at all. The numbers, and the reasoning behind each one, are in
 * `exit-codes.ts`; this file holds what a call site actually writes.
 */

/**
 * Every outcome this CLI can exit with, named.
 *
 * A closed union, so a call site cannot spell one wrong and a new one cannot be
 * added without this file changing. The gate's obligation set is derived from
 * `EXIT_CODES`' own keys, so a category deleted here fails the suite by NAME
 * rather than quietly shrinking the population it is measured against.
 */
export type ExitCategory =
  /** The command completed. It does not always mean the thing happened. */
  | "success"
  /**
   * A failure with no more specific category. THE GENUINE FALLBACK, and it must
   * stay one: reaching for it because the category is inconvenient to determine
   * is how the CLI ended up with 467 sites that all said `1`.
   */
  | "failed"
  /** No usable credential, or one the server rejected. HTTP 401. */
  | "not-authenticated"
  /** The credential is good and is not allowed to do this. HTTP 403. */
  | "permission-denied"
  /**
   * The named thing does not exist. HTTP 404, and also a 2xx whose body means
   * "absent" — see `printNotFound` in `errors.ts`.
   */
  | "not-found"
  /**
   * The invocation or its payload was refused. A missing required option, an
   * unknown flag, a value outside a `.choices()` set, HTTP 400 / 409 / 422, and
   * CLI-side cross-field validation that refuses to make the call at all.
   *
   * 409 lives here rather than in its own category because a conflict IS an
   * invalid state for the request as sent, which is the admin tree's own reading
   * of `5`. The `code` field names which conflict.
   */
  | "invalid-input"
  /** The request arrived and the server failed. HTTP >= 500. */
  | "remote-error"
  /**
   * The API could not be reached at all — DNS, TLS, socket, offline. RETRYABLE,
   * and that is the whole reason it is not `failed`: a script that backs off and
   * retries this one is doing the right thing.
   */
  | "connection-failed"
  /**
   * The CLI stopped waiting. NOT a synonym for `connection-failed` — the server
   * may still be completing the request, so a blind retry of a write can
   * duplicate it.
   */
  | "timed-out"
  /**
   * A local operation this CLI performed failed — an install, a config write, a
   * file write, a spawn. Nothing about the caller's input is wrong and no retry
   * against the API helps.
   */
  | "local-failed"
  /**
   * The operation RAN, and the outcome the caller wanted did not happen.
   *
   * Distinct from every failure above, all of which leave the machine as it was.
   * Here something changed and it was not enough — `nexus upgrade` writing a new
   * package to disk while the shell still resolves an older copy is the worked
   * case. RETRYING IS THE TRAP: it repeats the same successful half forever.
   */
  | "outcome-not-reached"
  /**
   * The operation ran and its result COULD NOT BE MEASURED.
   *
   * 🚨 THIS IS NOT A FAILURE AND IT IS NOT A SUCCESS, AND collapsing it into
   * either is the defect it exists to prevent. `nexus upgrade` under `sudo`
   * installs as root and can only read root's environment; reporting that as
   * `outcome-not-reached` names a PATH problem that may not exist, and reporting
   * it as `success` claims a check nobody performed.
   */
  | "unmeasured"
  /**
   * The caller stopped the command. `128 + 2`, the shell's own encoding of
   * "killed by signal 2" — see `exit-codes.ts` for why the band above `126` is
   * not ours to assign.
   *
   * 🚨 THE CLI DOES CHOOSE THIS ONE, FROM EXACTLY ONE PLACE, AND NOT ON THE
   * SIGNAL A READER EXPECTS. `runAppLogsFollow` in
   * `commands/apps/logs/run-app-logs-follow.ts` counts signals and exits here
   * on the SECOND. ONE counter serves both `SIGINT` and `SIGTERM`, so the pair
   * that reaches it is usually MIXED — a user presses Ctrl-C, a supervisor then
   * sends `SIGTERM` into the same process, and that is the second. THE FIRST
   * SIGNAL OF EITHER KIND ABORTS THE STREAM AND THE COMMAND EXITS `success`,
   * which is why "Ctrl-C gives you 130" is the wrong thing to script against.
   *
   * ⚠️ A FOLLOW ENDED BY TWO `SIGTERM`s ALSO REPORTS `128 + 2`, NEVER
   * `128 + 15`. Deliberate: this taxonomy declares ONE code in the shell's band
   * and `exitCodeTaxonomyViolations` refuses a second, so "the caller stopped
   * it" is one category here rather than one per signal. Read this number as
   * INTERRUPTED, never as WHICH SIGNAL ARRIVED.
   */
  | "interrupted";
