/**
 * When a failed request may be sent again, and how long to wait first.
 *
 * Split out of `http-client.ts` so the two decisions that carry the real risk —
 * "is replaying this safe" and "how long does the server want us to wait" — are
 * pure functions with their own tests, rather than branches buried in a loop
 * that also owns sockets, timeouts and body cancellation.
 */

/**
 * Methods a retry cannot add an effect to.
 *
 * This set is the whole safety argument for replaying a request whose outcome is
 * UNKNOWN, so it is deliberately narrow. HTTP defines GET/HEAD/OPTIONS/PUT/DELETE
 * as idempotent: replaying one lands the caller in the same state as sending it
 * once, whether or not the first attempt reached the server.
 *
 * **POST and PATCH are absent on purpose and must stay absent.** A 502 from an
 * edge proxy cannot distinguish "no healthy upstream, the request was never
 * forwarded" from "the upstream applied it and the connection died before the
 * response came back". Replaying a POST on the second reading duplicates its
 * effect. `POST /emulator/:id/sessions/:id/messages` is the worked example: it
 * writes a message and starts an agent turn, so an automatic retry would post
 * the user's message twice and bill two model calls — strictly worse than
 * surfacing the error.
 *
 * See {@link isRetryableStatus} for the one status where the outcome is NOT
 * unknown, and where this set therefore does not apply.
 */
export const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
  "PUT",
  "DELETE"
]);

/**
 * Statuses that mean "the edge could not reach a healthy upstream right now".
 *
 * All three are produced by the proxy in front of the API rather than by the
 * application, which is why the body is typically HTML and never the v1 error
 * envelope. They are the signature of a rolling deploy: a request in flight on a
 * pod that is being replaced comes back as one of these, seconds into a call
 * that normally succeeds.
 *
 * 500 is NOT here. An application-level failure is deterministic often enough
 * that replaying it just triples the load, and it carries a real error body the
 * caller should see.
 */
export const PROXY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

/** Too Many Requests. Its own constant because it is the one status with a stated wait. */
export const TOO_MANY_REQUESTS = 429;

/** Retries on top of the first attempt. Three attempts total. */
export const DEFAULT_MAX_RETRIES = 2;

/** First backoff step; each subsequent retry doubles it. */
export const DEFAULT_RETRY_BASE_DELAY_MS = 250;

/** Upper bound on a single BACKOFF, so a large `maxRetries` cannot stall a CLI. */
export const MAX_RETRY_DELAY_MS = 5_000;

/**
 * Default ceiling on the SUM of every wait in one request's retry sequence.
 *
 * A separate bound from `maxRetries`, because the two fail in different
 * directions and neither implies the other. `maxRetries` bounds how many times
 * we ask; only this bounds how LONG we are prepared to sit there. Before
 * `Retry-After` existed here every wait came from a curve capped at
 * {@link MAX_RETRY_DELAY_MS}, so the attempt count alone bounded the total. A
 * server-stated wait breaks that: one `Retry-After: 3600` is an hour, and a CLI
 * that honours it silently is indistinguishable from a CLI that hung.
 *
 * 60 s is the largest wait that is still plainly a wait rather than a hang, and
 * it comfortably covers this API's own rate-limit block, whose duration is one
 * configured window. Anything longer is a decision for the person running the
 * command, so it is surfaced rather than absorbed — see
 * {@link RetryDecision}'s `refused` arm.
 */
export const DEFAULT_MAX_TOTAL_RETRY_WAIT_MS = 60_000;

/**
 * Whether a status is worth sending again at all.
 *
 * `method` decides the answer for a proxy status and is IRRELEVANT for a 429,
 * which is the asymmetry this function exists to express:
 *
 *  - A **5xx** is an ambiguous outcome. The request may have been applied. Only
 *    {@link IDEMPOTENT_METHODS} may be replayed.
 *  - A **429 is a REFUSAL, not an outcome.** The server states it did not
 *    service the request. In this API that is structural rather than a
 *    convention: the 429 is thrown by `PublicApiThrottlerGuard.handleRequest`,
 *    a NestJS *guard*, and a guard runs to completion before the route handler
 *    is entered. No handler ran, so no effect exists to duplicate, so replaying
 *    a POST is exactly as safe as replaying a GET. Restricting 429 to idempotent
 *    methods would leave every write in a script failing on the one error the
 *    server explicitly told us how to recover from.
 */
export function isRetryableStatus(status: number, method: string): boolean {
  if (status === TOO_MANY_REQUESTS) return true;
  return PROXY_STATUSES.has(status) && IDEMPOTENT_METHODS.has(method.toUpperCase());
}

/**
 * Full-jitter exponential backoff: a uniform draw from `[0, base * 2^n]`,
 * capped.
 *
 * Jittered rather than fixed because every client that failed did so for the
 * same reason at the same instant — a synchronised retry would hit the
 * recovering upstream as one wave. Drawing from zero spreads them out.
 *
 * @param attempt - 1 for the first retry, 2 for the second, and so on.
 * @param baseDelayMs - The first step.
 * @param random - Injectable source, so a test can pin the delay.
 */
export function retryDelayMs(
  attempt: number,
  baseDelayMs: number,
  random: () => number = Math.random
): number {
  const ceiling = Math.min(baseDelayMs * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
  return Math.floor(random() * ceiling);
}

/**
 * Parse a `Retry-After` header into milliseconds, or `undefined` when it does
 * not state a usable wait.
 *
 * RFC 9110 allows TWO forms and both are legal, so both are handled:
 *
 *  - **delay-seconds** — a non-negative integer. This is what this API sends:
 *    `PublicApiThrottlerGuard` writes `Math.ceil(blockPttlMs / 1000)`.
 *  - **HTTP-date** — an absolute instant. No part of this stack emits one, but a
 *    CDN or a reverse proxy in front of it may, and a client that only reads the
 *    integer form silently ignores the wait it was given.
 *
 * `undefined` is returned — never zero and never a throw — for an absent header,
 * a malformed one, a date in the past, and a negative count. **Zero would be the
 * dangerous return**: it is a legal wait meaning "immediately", so a parse
 * failure collapsing to it would turn a rate-limit response into a hot loop
 * against the server that just asked for room. The caller reads `undefined` as
 * "the server stated nothing usable" and falls back to the jittered backoff.
 *
 * @param header - The raw header value, or `null` when absent.
 * @param now - Injectable clock, so the HTTP-date arm is testable. Milliseconds.
 */
export function parseRetryAfterMs(
  header: string | null | undefined,
  now: number = Date.now()
): number | undefined {
  if (typeof header !== "string") return undefined;

  const value = header.trim();
  if (value === "") return undefined;

  // delay-seconds first: it is the common form and it is unambiguous. The regex
  // is anchored and digits-only on purpose — `Number("12abc")` is NaN but
  // `parseInt("12abc")` is 12, and accepting the second would read a wait out of
  // a header that is plainly malformed. A leading `+` or `-`, a decimal point
  // and whitespace inside all fall through to the date arm and then to
  // `undefined`.
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isFinite(seconds) ? seconds * 1_000 : undefined;
  }

  // HTTP-date, and the day-of-week gate in front of it is NOT decoration.
  //
  // `Date.parse` is far more permissive than any HTTP date grammar and it does
  // not fail the way a parser should: it read `-5`, `+5`, `1.5` and `10, 20` as
  // real instants — all of them in the past — so each one came back through the
  // clamp below as a wait of ZERO. That is precisely the hot-loop return this
  // function exists to never produce, reached through the arm meant to be the
  // careful one.
  //
  // All three date forms RFC 9110 permits begin with a day-of-week name, and no
  // malformed numeric value does:
  //
  //   IMF-fixdate  Sun, 06 Nov 1994 08:49:37 GMT   (the one a server must send)
  //   RFC 850      Sunday, 06-Nov-94 08:49:37 GMT  (obsolete, must be accepted)
  //   asctime      Sun Nov  6 08:49:37 1994        (obsolete, must be accepted)
  //
  // So requiring one is both the cheapest and the most faithful gate. Anything
  // that is neither delay-seconds nor a day-of-week-led date is malformed, and
  // malformed means `undefined`.
  //
  // Each alternative must accept the THREE-LETTER form on its own, because that
  // is the one an IMF-fixdate carries and IMF-fixdate is the form a server is
  // required to generate. `Satur?` does not: `?` binds to the `r` alone, so it
  // demands at least `Satu` and rejects `Sat` — every Saturday `Retry-After`
  // date fell through to the backoff, and the asctime form `Sat Aug 22 …` with
  // it. Written `Sat(ur)?`, the optional group covers `Satur`/`Saturday` without
  // making any of it mandatory. `Wed(nes)?` was already correct for the same
  // reason; `Satur?` was the one that was not.
  if (!/^(Mon|Tues?|Wed(nes)?|Thur?s?|Fri|Sat(ur)?|Sun)(day)?[,\s]/i.test(value)) {
    return undefined;
  }

  // `Date.parse` returns NaN for anything it cannot read, which is the
  // remaining malformed case — a day name in front of nonsense.
  const at = Date.parse(value);
  if (Number.isNaN(at)) return undefined;

  // A date at or before now falls back to the backoff — it does NOT return 0.
  //
  // The day-of-week gate above is better than no gate and it is not airtight:
  // measured against an adversarial battery, `Fri, -5`, `Wed, 1.5` and `Mon, 2`
  // all clear it and `Date.parse` reads each as a real instant in the past. That
  // is the original defect wearing a day name, and clamping it to 0 would hand
  // back the hot-loop value for a header that is plainly malformed.
  //
  // So the clamp is removed rather than the gate widened, which closes the whole
  // class instead of the three spellings that were found. After this the ONLY
  // way to obtain a zero wait is a literal `Retry-After: 0` through the
  // digits-only arm above — every outcome of the date arm is either a real
  // future wait or `undefined`.
  //
  // The cost is that a genuine past date, which means "you may retry now", waits
  // one backoff step instead of none. That is a few hundred milliseconds, and it
  // still spreads a synchronised herd, so it is the better failure anyway.
  const wait = at - now;
  return wait > 0 ? wait : undefined;
}

/**
 * What to do after a retryable failure.
 *
 * Three arms rather than a nullable number, because "wait 40 s" and "the server
 * asked for 40 minutes and we are not doing that" are different outcomes that a
 * single `number | undefined` would flatten into the same silent cap.
 */
export type RetryDecision =
  /** Sleep `delayMs`, then send again. `statedByServer` records where the number came from. */
  | { kind: "retry"; delayMs: number; statedByServer: boolean }
  /**
   * Do not retry, because the server's own stated wait does not fit the budget.
   * `requestedMs` is what it actually asked for, so the caller can say the real
   * number instead of a capped one.
   */
  | { kind: "refused"; requestedMs: number; remainingBudgetMs: number }
  /**
   * Do not retry, because the total-wait budget is spent. Distinct from
   * `refused`: no server asked for anything here, so there is no number to
   * report back and nothing for the caller to explain beyond having stopped.
   */
  | { kind: "exhausted" };

/**
 * Decide the wait before the next attempt.
 *
 * The server's `Retry-After` OUTRANKS the backoff curve whenever it parses. It
 * is the only party that knows when the block actually lifts; guessing shorter
 * earns another 429 and guessing longer wastes the user's time.
 *
 * A stated wait that does not fit the remaining budget is REFUSED rather than
 * capped, and a budget that is already spent fits NOTHING — not even a stated
 * wait of zero. Capping it would send the next attempt while the block is provably
 * still live — a guaranteed second 429 that also spends the budget — and would
 * hide from the user that the real wait was minutes. See
 * {@link DEFAULT_MAX_TOTAL_RETRY_WAIT_MS}.
 *
 * A BACKOFF wait is capped rather than refused: it is our own guess, it is
 * already bounded by {@link MAX_RETRY_DELAY_MS}, and there is no server
 * instruction to contradict.
 *
 * @param attempt - 1 for the first retry, 2 for the second, and so on.
 * @param retryAfterMs - Parsed from the header, or `undefined` if it stated nothing usable.
 * @param remainingBudgetMs - What is left of the total-wait budget.
 * @param baseDelayMs - The backoff's first step.
 * @param random - Injectable jitter source.
 */
export function decideRetry(
  attempt: number,
  retryAfterMs: number | undefined,
  remainingBudgetMs: number,
  baseDelayMs: number,
  random: () => number = Math.random
): RetryDecision {
  if (retryAfterMs !== undefined) {
    // A SPENT budget fits nothing, and the comparison alone does not say so.
    //
    // `retryAfterMs > remainingBudgetMs` is a strict greater-than, so a literal
    // `Retry-After: 0` against a budget of `0` read as "it fits" and came back as
    // a retry with a zero-length wait. That is the hole the `exhausted` arm below
    // closes on the backoff path, reopened through the header: a zero wait spends
    // zero budget, so `budgetMs -= 0` leaves the budget untouched and only
    // `maxRetries` can stop the sequence — while `maxTotalRetryWaitMs` is
    // advertised as an INDEPENDENT bound, and `0` is documented to accept no
    // server-stated wait at all.
    //
    // The budget test comes first and is separate from the fit test on purpose:
    // an exact fit is still honoured (`retryAfterMs === remainingBudgetMs` with
    // budget left is a legal wait that consumes the rest of it), so tightening
    // the comparison to `>=` would have refused a wait that genuinely fits
    // rather than closing this.
    if (remainingBudgetMs <= 0 || retryAfterMs > remainingBudgetMs) {
      return { kind: "refused", requestedMs: retryAfterMs, remainingBudgetMs };
    }
    return { kind: "retry", delayMs: retryAfterMs, statedByServer: true };
  }

  // The budget has to bound the BACKOFF path too, and a naive `Math.min` does
  // not do it. `Math.min(delay, 0)` is `0`, and a zero-length wait spends zero
  // budget — so an exhausted budget would hand back "retry immediately" forever
  // and the attempt cap would be the only thing between a large `maxRetries` and
  // an undelayed hammering of the server. `maxRetries` and `maxTotalRetryWaitMs`
  // are advertised as two independent bounds; this is what makes the second one
  // real rather than decorative.
  if (remainingBudgetMs <= 0) return { kind: "exhausted" };

  const backoff = Math.min(retryDelayMs(attempt, baseDelayMs, random), remainingBudgetMs);
  return { kind: "retry", delayMs: backoff, statedByServer: false };
}
