import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpClient, type HttpClientOptions } from "./http-client";
import {
  decideRetry,
  DEFAULT_MAX_TOTAL_RETRY_WAIT_MS,
  isRetryableStatus,
  parseRetryAfterMs
} from "./retry-policy";

/**
 * 429 and `Retry-After`.
 *
 * ── What the server actually sends ──────────────────────────────────────────
 *
 * `PublicApiThrottlerGuard.handleRequest` ends with
 * `res.header("Retry-After", timeToBlockExpire)` then throws, and
 * `RedisThrottlerStorage` computes that field as `Math.ceil(blockPttlMs / 1000)`
 * — so the form this API emits is DELAY-SECONDS, always an integer. The
 * HTTP-date arm is covered anyway because RFC 9110 permits it and a CDN in
 * front of the API may use it; a client that reads only the integer form
 * silently ignores a wait it was handed.
 *
 * ── Why a 429 is replayed on a POST and a 502 is not ────────────────────────
 *
 * That 429 is thrown from a NestJS **guard**. A guard runs to completion before
 * the route handler is entered, so a 429 is a REFUSAL — nothing ran, so nothing
 * can be double-applied. A 502 is an ambiguous OUTCOME: the upstream may have
 * applied the request before the connection died. The tests below pin both
 * directions, because getting this backwards is silent in either direction —
 * too strict and every write in a script dies on the one error the server told
 * us how to recover from; too loose and a retry duplicates a purchase.
 *
 * ── How the wait is asserted ────────────────────────────────────────────────
 *
 * Through the injected `sleep`, which receives the exact millisecond value the
 * client decided on. That is strictly stronger than measuring elapsed time under
 * fake timers, which can only show that *some* time passed. The one thing a
 * value spy cannot see — that the wait is actually awaited BEFORE the next
 * request rather than computed and dropped — is covered separately by
 * `records the wait and the attempt in order`, which interleaves both into one
 * log.
 */

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// Harness
// ============================================================================

interface Step {
  status: number;
  retryAfter?: string;
}

interface Harness {
  http: HttpClient;
  /** One entry per fetch, in order: the method that was sent. */
  calls: string[];
  /** One entry per wait, in order: the milliseconds the client asked to sleep. */
  waits: number[];
  /** Interleaved `fetch`/`sleep` log, for asserting the ORDER rather than the values. */
  events: string[];
  notices: Array<Record<string, unknown>>;
}

/**
 * A client whose responses come from a script and whose every wait is recorded.
 *
 * `random` is pinned to its maximum draw so a backoff delay is the curve's
 * ceiling exactly, rather than a uniform sample nothing can assert. The real
 * jitter is asserted by `retryDelayMs`'s own tests in `http-client.test.ts`.
 */
function harness(script: readonly Step[], opts: Partial<HttpClientOptions> = {}): Harness {
  const calls: string[] = [];
  const waits: number[] = [];
  const events: string[] = [];
  const notices: Array<Record<string, unknown>> = [];

  const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const step = script[Math.min(calls.length, script.length - 1)];
    calls.push(String(init?.method ?? "GET"));
    events.push(`fetch:${step.status}`);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (step.retryAfter !== undefined) headers["Retry-After"] = step.retryAfter;
    return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
      status: step.status,
      headers
    });
  });

  const http = new HttpClient({
    baseUrl: "https://api.nexusgpt.io",
    apiKey: "nxs_test",
    fetch: fetchFn as unknown as typeof globalThis.fetch,
    random: () => 0.999999,
    sleep: async (ms: number) => {
      waits.push(ms);
      events.push(`sleep:${ms}`);
    },
    onRetry: (n) => notices.push({ ...n }),
    ...(opts as object)
  });

  return { http, calls, waits, events, notices };
}

// ============================================================================
// parseRetryAfterMs — both legal forms, and everything that is neither
// ============================================================================

describe("parseRetryAfterMs — delay-seconds", () => {
  const CASES = [
    { header: "0", ms: 0 },
    { header: "1", ms: 1_000 },
    { header: "30", ms: 30_000 },
    { header: "120", ms: 120_000 },
    { header: "3600", ms: 3_600_000 },
    // Surrounding whitespace is legal in a header value and must not defeat the parse.
    { header: "  45  ", ms: 45_000 }
  ] as const;

  eachOrRefuse(CASES, "legal delay-seconds Retry-After values").forEach(({ header, ms }) => {
    it(`reads ${JSON.stringify(header)} as ${ms}ms`, () => {
      expect(parseRetryAfterMs(header)).toBe(ms);
    });
  });
});

describe("parseRetryAfterMs — HTTP-date", () => {
  const NOW = Date.parse("Tue, 18 Aug 2026 12:00:00 GMT");

  it("reads a future IMF-fixdate as the milliseconds until it", () => {
    expect(parseRetryAfterMs("Tue, 18 Aug 2026 12:00:45 GMT", NOW)).toBe(45_000);
  });

  it("falls back on a date already past — it never returns zero", () => {
    // `undefined`, not `0`. The day-of-week gate is not airtight: `Fri, -5`,
    // `Wed, 1.5` and `Mon, 2` all clear it and `Date.parse` reads each as a real
    // past instant, so a clamp to zero would hand malformed input the hot-loop
    // value. Refusing every non-future date closes the class rather than the
    // three spellings a battery happened to find.
    expect(parseRetryAfterMs("Tue, 18 Aug 2026 11:59:00 GMT", NOW)).toBeUndefined();
  });

  it("refuses the malformed dates the day-of-week gate cannot catch", () => {
    // These are the residual hole, pinned so a future widening of the gate
    // cannot quietly re-open it. Each clears the prefix check and each is read
    // by `Date.parse` as a past instant.
    for (const header of ["Fri, -5", "Wed, 1.5", "Mon, 2", "Sun, 06 Nov 1994 08:49:37 GMT"]) {
      expect({ header, ms: parseRetryAfterMs(header, NOW) }).toEqual({ header, ms: undefined });
    }
  });

  /**
   * EVERY day-of-week form the three legal date grammars can carry.
   *
   * The single-case version of this test is what let `Satur?` ship: `?` binds to
   * the `r` alone, so the alternative demanded `Satu` and rejected `Sat` — and
   * `Sat` is the form an IMF-fixdate carries, which is the form a server is
   * REQUIRED to generate. Every Saturday `Retry-After` date fell silently
   * through to the backoff.
   *
   * A per-day table is the only shape that catches it, because six of seven days
   * were fine and any single example other than Saturday passes. Enumerate the
   * whole population when the population is seven items.
   */
  const DAYS = [
    { abbr: "Mon", full: "Monday" },
    { abbr: "Tue", full: "Tuesday" },
    { abbr: "Wed", full: "Wednesday" },
    { abbr: "Thu", full: "Thursday" },
    { abbr: "Fri", full: "Friday" },
    { abbr: "Sat", full: "Saturday" },
    { abbr: "Sun", full: "Sunday" }
  ] as const;

  eachOrRefuse(DAYS, "every day-of-week an HTTP-date can name").forEach(({ abbr, full }) => {
    it(`accepts a future IMF-fixdate naming ${abbr}`, () => {
      // Deliberately not asserting the exact millisecond gap — the point is that
      // the day name does not DISQUALIFY the header. A rejected day returns
      // undefined, which is what this catches.
      expect(parseRetryAfterMs(`${abbr}, 18 Aug 2050 12:00:00 GMT`, NOW)).toBeGreaterThan(0);
    });

    it(`accepts the RFC 850 full name ${full} when the year is unambiguous`, () => {
      expect(parseRetryAfterMs(`${full}, 18-Aug-2050 12:00:00 GMT`, NOW)).toBeGreaterThan(0);
    });
  });

  it("degrades a two-digit RFC 850 year to the backoff rather than guessing the century", () => {
    // Measured, not assumed: `Date.parse` DOES read `18-Aug-50` — it maps the
    // two-digit year to 1950, not 2050. So the date lands in the past and the
    // future-only rule returns `undefined`, which falls back to the backoff.
    //
    // That is the safe direction and it is why this is a test rather than a fix.
    // The alternative is guessing a century on the caller's behalf, and guessing
    // 2050 where the server meant 1950 would honour a wait of twenty-four years.
    // A few hundred milliseconds of backoff is the better answer to an ambiguous
    // header.
    expect(parseRetryAfterMs("Sunday, 06-Nov-94 08:49:37 GMT", NOW)).toBeUndefined();
    expect(parseRetryAfterMs("Monday, 18-Aug-50 12:00:00 GMT", NOW)).toBeUndefined();
  });

  it("accepts the asctime form, which carries the abbreviation with no comma", () => {
    // `Sat Aug 22 …` was rejected by the same defect, through the `[,\s]` arm
    // rather than the comma one. Both spellings of Saturday were broken.
    expect(parseRetryAfterMs("Sat Aug 22 12:00:00 2050", NOW)).toBeGreaterThan(0);
  });

  it("still rejects a word that merely STARTS with a day name", () => {
    // The control on the fix. `Sat(ur)?` must not turn into a prefix match that
    // waves through any word beginning with those letters.
    for (const header of ["Satellite, 5", "Satisfy me", "Sunscreen, 3", "Monolith, 1"]) {
      expect({ header, ms: parseRetryAfterMs(header, NOW) }).toEqual({ header, ms: undefined });
    }
  });

  it("still reads a genuine future date, so the fix did not disable the arm", () => {
    // The control. Without it, `return undefined` everywhere would pass the
    // three refusal tests above.
    expect(parseRetryAfterMs("Thu, 18 Aug 2050 00:00:00 GMT", NOW)).toBeGreaterThan(0);
  });

  it("reads a date minutes out, so the budget refusal can see it", () => {
    expect(parseRetryAfterMs("Tue, 18 Aug 2026 12:10:00 GMT", NOW)).toBe(600_000);
  });
});

describe("parseRetryAfterMs — anything that is neither form is undefined, never zero", () => {
  /**
   * `undefined` is load-bearing and `0` would be the dangerous return: zero is a
   * LEGAL wait meaning "retry immediately", so a malformed header collapsing to
   * it turns a rate-limit response into a hot loop against the server that just
   * asked for room. Every row here must come back `undefined` so the caller
   * falls through to the backoff.
   */
  const CASES = [
    { label: "absent", header: null },
    { label: "undefined", header: undefined },
    { label: "empty", header: "" },
    { label: "whitespace only", header: "   " },
    { label: "words", header: "later" },
    { label: "digits with a suffix", header: "12abc" },
    { label: "negative", header: "-5" },
    { label: "signed positive", header: "+5" },
    { label: "fractional", header: "1.5" },
    { label: "a date that is not a date", header: "Notaday, 99 Xxx 2026 99:99:99 GMT" },
    { label: "hex", header: "0x10" },
    { label: "two values", header: "10, 20" }
  ] as const;

  eachOrRefuse(CASES, "malformed Retry-After header values").forEach(({ label, header }) => {
    it(`returns undefined for ${label}`, () => {
      expect(parseRetryAfterMs(header)).toBeUndefined();
    });
  });
});

// ============================================================================
// isRetryableStatus — the method matters for a 5xx and not for a 429
// ============================================================================

describe("isRetryableStatus", () => {
  const METHODS = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE", "POST", "PATCH"] as const;

  eachOrRefuse(METHODS, "every HTTP method the SDK sends").forEach((method) => {
    it(`retries a 429 on ${method} — a refusal ran no handler, so nothing can duplicate`, () => {
      expect(isRetryableStatus(429, method)).toBe(true);
    });
  });

  eachOrRefuse([502, 503, 504] as const, "proxy statuses").forEach((status) => {
    it(`retries ${status} on GET but NOT on POST — the outcome is ambiguous`, () => {
      expect({
        get: isRetryableStatus(status, "GET"),
        post: isRetryableStatus(status, "POST")
      }).toEqual({ get: true, post: false });
    });
  });

  eachOrRefuse([400, 401, 403, 404, 409, 422, 500] as const, "non-retryable statuses").forEach(
    (status) => {
      it(`never retries ${status}, on any method`, () => {
        expect(isRetryableStatus(status, "GET")).toBe(false);
        expect(isRetryableStatus(status, "POST")).toBe(false);
      });
    }
  );
});

// ============================================================================
// decideRetry — stated wait outranks the curve; over budget REFUSES
// ============================================================================

describe("decideRetry", () => {
  const MAX = () => 0.999999;

  it("uses the server's stated wait verbatim when it fits the budget", () => {
    expect(decideRetry(1, 2_000, 60_000, 250, MAX)).toEqual({
      kind: "retry",
      delayMs: 2_000,
      statedByServer: true
    });
  });

  it("falls back to the backoff curve when the server stated nothing usable", () => {
    const decision = decideRetry(1, undefined, 60_000, 250, MAX);
    expect(decision).toEqual({ kind: "retry", delayMs: 249, statedByServer: false });
  });

  it("REFUSES a stated wait larger than the remaining budget, reporting the real number", () => {
    // Not capped to 60s. A capped wait would send the next attempt while the
    // block is provably still live — a guaranteed second 429 that also spends
    // the budget — and would hide from the user that the real wait was an hour.
    expect(decideRetry(1, 3_600_000, 60_000, 250, MAX)).toEqual({
      kind: "refused",
      requestedMs: 3_600_000,
      remainingBudgetMs: 60_000
    });
  });

  it("accepts a stated wait exactly equal to the budget — the bound is inclusive", () => {
    expect(decideRetry(1, 60_000, 60_000, 250, MAX)).toMatchObject({
      kind: "retry",
      delayMs: 60_000
    });
  });

  it("caps a BACKOFF to the remaining budget rather than refusing it", () => {
    // Asymmetric on purpose: a backoff is our own guess with no server
    // instruction to contradict, so shortening it misleads nobody.
    expect(decideRetry(5, undefined, 100, 250, MAX)).toEqual({
      kind: "retry",
      delayMs: 100,
      statedByServer: false
    });
  });

  it("reports EXHAUSTED rather than a zero-delay retry once the budget is spent", () => {
    // The bug this pins was found by MUTATION, not by review. With the attempt
    // cap removed the suite did not go red — it ran out of memory, because
    // `Math.min(delay, 0)` is `0`, a zero-length wait spends zero budget, and the
    // loop span forever at full speed. `maxRetries` was silently the ONLY bound.
    expect(decideRetry(1, undefined, 0, 250, MAX)).toEqual({ kind: "exhausted" });
    expect(decideRetry(9, undefined, -1, 250, MAX)).toEqual({ kind: "exhausted" });
  });

  it("REFUSES a stated wait of ZERO once the budget is spent — a strict `>` let it through", () => {
    // `0 > 0` is false, so the fit test alone read a literal `Retry-After: 0` as
    // fitting a spent budget and returned a retry with a zero-length wait. A zero
    // wait subtracts nothing, so the budget never moved and `maxRetries` was left
    // as the only bound — the defect the `exhausted` arm closes for the backoff,
    // arriving through the header instead.
    expect(decideRetry(1, 0, 0, 250, MAX)).toEqual({
      kind: "refused",
      requestedMs: 0,
      remainingBudgetMs: 0
    });
  });

  it("still ACCEPTS a legitimate stated wait while budget remains — the refusal is not blanket", () => {
    // The other direction, and it is the one that keeps the test above honest: a
    // fix that refused every stated wait would satisfy the assertion above and
    // break retrying altogether. A zero wait against a budget that is NOT spent
    // is a legal instruction to retry immediately, and it is still honoured.
    expect(decideRetry(1, 5_000, 60_000, 250, MAX)).toEqual({
      kind: "retry",
      delayMs: 5_000,
      statedByServer: true
    });
    expect(decideRetry(1, 0, 60_000, 250, MAX)).toEqual({
      kind: "retry",
      delayMs: 0,
      statedByServer: true
    });
  });

  it("grows the backoff with the attempt number", () => {
    const delays = [1, 2, 3].map((n) => {
      const d = decideRetry(n, undefined, 60_000, 250, MAX);
      return d.kind === "retry" ? d.delayMs : -1;
    });
    expect(delays).toEqual([249, 499, 999]);
  });
});

// ============================================================================
// Through the client — attempt counts and the wait, on every case
// ============================================================================

describe("a 429 is honoured through the client", () => {
  it("waits exactly what Retry-After stated, then succeeds — 2 attempts", async () => {
    const h = harness([{ status: 429, retryAfter: "2" }, { status: 200 }]);

    await expect(h.http.request("GET", "/agents")).resolves.toEqual({ ok: true });
    expect({ attempts: h.calls.length, waits: h.waits }).toEqual({ attempts: 2, waits: [2_000] });
  });

  it("records the wait and the attempt in order — the sleep is awaited BEFORE the replay", async () => {
    // The one thing a delay-value spy cannot see. If the client computed the
    // right number and forgot to await it, every assertion above would still
    // pass and this one would show `fetch` before `sleep`.
    const h = harness([{ status: 429, retryAfter: "2" }, { status: 200 }]);

    await h.http.request("GET", "/agents");
    expect(h.events).toEqual(["fetch:429", "sleep:2000", "fetch:200"]);
  });

  it("honours an HTTP-date Retry-After, not just the integer form", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("Tue, 18 Aug 2026 12:00:00 GMT"));

    const h = harness([
      { status: 429, retryAfter: "Tue, 18 Aug 2026 12:00:15 GMT" },
      { status: 200 }
    ]);

    await expect(h.http.request("GET", "/agents")).resolves.toEqual({ ok: true });
    expect({ attempts: h.calls.length, waits: h.waits }).toEqual({ attempts: 2, waits: [15_000] });
  });

  it("falls back to the backoff when Retry-After is MALFORMED — never to zero", async () => {
    const h = harness([{ status: 429, retryAfter: "soon-ish" }, { status: 200 }]);

    await expect(h.http.request("GET", "/agents")).resolves.toEqual({ ok: true });
    // 249 is the curve's first step at the pinned maximum draw, NOT 0 and NOT a
    // parsed number. A parse that collapsed to zero would show `waits: [0]`.
    expect({ attempts: h.calls.length, waits: h.waits }).toEqual({ attempts: 2, waits: [249] });
  });

  it("falls back to the backoff when there is no Retry-After at all", async () => {
    const h = harness([{ status: 429 }, { status: 200 }]);

    await expect(h.http.request("GET", "/agents")).resolves.toEqual({ ok: true });
    expect({ attempts: h.calls.length, waits: h.waits }).toEqual({ attempts: 2, waits: [249] });
  });

  eachOrRefuse(["POST", "PATCH"] as const, "non-idempotent methods").forEach((method) => {
    it(`REPLAYS a ${method} on 429 — the guard refused it, so no effect exists to duplicate`, async () => {
      const h = harness([{ status: 429, retryAfter: "1" }, { status: 200 }]);

      await expect(h.http.request(method, "/agents", { body: { name: "x" } })).resolves.toEqual({
        ok: true
      });
      expect({ calls: h.calls, waits: h.waits }).toEqual({
        calls: [method, method],
        waits: [1_000]
      });
    });
  });

  eachOrRefuse(["POST", "PATCH"] as const, "non-idempotent methods").forEach((method) => {
    it(`still NEVER replays a ${method} on 502 — that outcome is ambiguous`, async () => {
      const h = harness([{ status: 502 }, { status: 200 }]);

      await expect(
        h.http.request(method, "/agents", { body: { name: "x" } })
      ).rejects.toMatchObject({ status: 502 });
      expect({ calls: h.calls, waits: h.waits }).toEqual({ calls: [method], waits: [] });
    });
  });

  it("does NOT retry a 400 that carries a Retry-After — the status decides, not the header", async () => {
    const h = harness([{ status: 400, retryAfter: "1" }, { status: 200 }]);

    await expect(h.http.request("GET", "/agents")).rejects.toMatchObject({ status: 400 });
    expect({ attempts: h.calls.length, waits: h.waits }).toEqual({ attempts: 1, waits: [] });
  });
});

describe("the bounds hold", () => {
  it("exhausts at three attempts and reports the count in the error", async () => {
    const h = harness([{ status: 429, retryAfter: "1" }]);

    const err = await h.http.request("GET", "/agents").catch((e: Error) => e);
    expect(err).toMatchObject({ status: 429, attempts: 3 });
    expect((err as Error).message).toContain("gave up after 3 attempts");
    expect({ attempts: h.calls.length, waits: h.waits }).toEqual({
      attempts: 3,
      waits: [1_000, 1_000]
    });
  });

  it("REFUSES to wait a Retry-After larger than the total budget, and never sleeps", async () => {
    const h = harness([{ status: 429, retryAfter: "3600" }]);

    const err = await h.http.request("GET", "/agents").catch((e: Error) => e);

    // One attempt, and crucially NO sleep: an unbounded honour would have slept
    // an hour here, which is indistinguishable from a hang.
    expect({ attempts: h.calls.length, waits: h.waits }).toEqual({ attempts: 1, waits: [] });
    // The REAL number the server asked for, not the cap.
    expect(err).toMatchObject({ status: 429, retryAfterMs: 3_600_000 });
    expect((err as Error).message).toContain("3600s");
    expect((err as Error).message).toContain("60s");
    expect((err as Error).message).not.toContain("gave up after");
  });

  it("spends the budget across successive waits, so a second large wait is refused", async () => {
    const h = harness([{ status: 429, retryAfter: "8" }], { maxTotalRetryWaitMs: 10_000 });

    const err = await h.http.request("GET", "/agents").catch((e: Error) => e);

    // 8s fits the 10s budget; the second 8s does not fit the 2s left, so it is
    // refused rather than retried a second time.
    expect({ attempts: h.calls.length, waits: h.waits }).toEqual({ attempts: 2, waits: [8_000] });
    expect(err).toMatchObject({ status: 429, retryAfterMs: 8_000, attempts: 2 });
  });

  it("honours maxTotalRetryWaitMs: 0 as 'accept no stated wait'", async () => {
    const h = harness([{ status: 429, retryAfter: "1" }], { maxTotalRetryWaitMs: 0 });

    await expect(h.http.request("GET", "/agents")).rejects.toMatchObject({ status: 429 });
    expect({ attempts: h.calls.length, waits: h.waits }).toEqual({ attempts: 1, waits: [] });
  });

  it("stops on the WAIT budget even when the attempt budget is enormous", async () => {
    // maxRetries is set absurdly high on purpose: this asserts the total-wait
    // bound is a real second bound rather than decoration behind the attempt
    // cap. Without the `exhausted` arm this test does not fail — it hangs and
    // then dies of an out-of-memory, which is why the arm exists.
    const h = harness([{ status: 429 }], { maxRetries: 10_000, maxTotalRetryWaitMs: 1_000 });

    await expect(h.http.request("GET", "/agents")).rejects.toMatchObject({ status: 429 });

    // Every wait is a full-jitter draw pinned to its ceiling: 249, 499, 999 then
    // whatever the 1s budget still affords. It terminates in a handful of
    // attempts, nowhere near 10,001.
    expect(h.waits.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1_000);
    expect(h.calls.length).toBeLessThan(10);
    expect(h.calls.length).toBeGreaterThan(1);
  });

  it("does not replay on a `Retry-After: 0` once the budget is spent, and never hot-loops", async () => {
    // The end-to-end shape of the unit test above, through the real loop. With
    // the strict `>` this made a SECOND request with no wait at all: the server
    // asked for zero, the spent budget accepted it, and nothing subtracted
    // anything. `maxRetries` is raised well above the default so an undelayed
    // replay shows up as a burst of attempts rather than being hidden by the
    // attempt cap two requests later.
    const h = harness([{ status: 429, retryAfter: "0" }], {
      maxRetries: 50,
      maxTotalRetryWaitMs: 0
    });

    const err = await h.http.request("GET", "/agents").catch((e: Error) => e);

    expect({ attempts: h.calls.length, waits: h.waits }).toEqual({ attempts: 1, waits: [] });
    expect(err).toMatchObject({ status: 429, retryAfterMs: 0 });
  });

  it("still honours a stated wait when the budget is merely SMALL rather than spent", async () => {
    // The counterweight: a budget of 1s is not a spent budget, so a 1s stated
    // wait is still honoured exactly. A refusal that keyed off anything other
    // than the budget being spent would fail here.
    const h = harness([{ status: 429, retryAfter: "1" }], {
      maxRetries: 1,
      maxTotalRetryWaitMs: 1_000
    });

    await expect(h.http.request("GET", "/agents")).rejects.toMatchObject({ status: 429 });
    expect({ attempts: h.calls.length, waits: h.waits }).toEqual({ attempts: 2, waits: [1_000] });
  });

  it("defaults the total wait to one minute", () => {
    expect(DEFAULT_MAX_TOTAL_RETRY_WAIT_MS).toBe(60_000);
  });

  it("honours maxRetries: 0 as OFF even for a 429", async () => {
    const h = harness([{ status: 429, retryAfter: "1" }], { maxRetries: 0 });

    await expect(h.http.request("GET", "/agents")).rejects.toMatchObject({ status: 429 });
    expect({ attempts: h.calls.length, waits: h.waits }).toEqual({ attempts: 1, waits: [] });
  });
});

describe("the refusal message tells the truth about what already happened", () => {
  it("does not claim NO retry was attempted after earlier waits already ran", async () => {
    // 8s fits the 10s budget, so one wait runs; the second 8s does not fit the 2s
    // left and is refused. The message therefore carries BOTH the refusal clause
    // and the `(gave up after N attempts)` suffix, and a fixed "so no retry was
    // attempted" made those two halves contradict each other about the same
    // request.
    const h = harness([{ status: 429, retryAfter: "8" }], { maxTotalRetryWaitMs: 10_000 });

    const err = await h.http.request("GET", "/agents").catch((e: Error) => e);
    const message = (err as Error).message;

    expect({ attempts: h.calls.length, waits: h.waits }).toEqual({ attempts: 2, waits: [8_000] });
    expect(message).toContain("gave up after 2 attempts");
    expect(message).toContain("no further retry was attempted");
    // The contradiction itself, asserted as a pair rather than as one substring:
    // either half is fine alone, and only their co-occurrence is the defect.
    expect(message.includes("so no retry was attempted") && message.includes("gave up after")).toBe(
      false
    );
  });

  it("still says NO retry was attempted when the very first response was refused", async () => {
    // The other direction. Nothing ran before this refusal, so the plain wording
    // is the true one and must survive — a fix that always said "no further"
    // would be as wrong here as the original was above.
    const h = harness([{ status: 429, retryAfter: "3600" }]);

    const err = await h.http.request("GET", "/agents").catch((e: Error) => e);
    const message = (err as Error).message;

    expect({ attempts: h.calls.length, waits: h.waits }).toEqual({ attempts: 1, waits: [] });
    expect(message).toContain("so no retry was attempted");
    expect(message).not.toContain("gave up after");
  });

  it("names a SPENT budget as spent rather than claiming zero exceeds zero", async () => {
    // A spent budget now refuses even a stated wait of `0`, and the arithmetic
    // clause would then read "0s ... exceeds the 0s left", which is false. The
    // reason is the budget being gone, so that is what it says.
    const h = harness([{ status: 429, retryAfter: "0" }], { maxTotalRetryWaitMs: 0 });

    const err = await h.http.request("GET", "/agents").catch((e: Error) => e);
    const message = (err as Error).message;

    expect(message).toContain("retry budget is already spent");
    expect(message).not.toContain("exceeds");
    expect(message).toContain("The server asked for 0s before a retry");
  });
});

describe("the retry is surfaced to the caller", () => {
  it("announces each wait before performing it, with where the number came from", async () => {
    const h = harness([{ status: 429, retryAfter: "2" }, { status: 429 }, { status: 200 }]);

    await expect(h.http.request("GET", "/agents")).resolves.toEqual({ ok: true });

    expect(h.notices).toEqual([
      {
        method: "GET",
        url: "https://api.nexusgpt.io/api/public/v1/agents",
        attempt: 1,
        maxAttempts: 3,
        status: 429,
        delayMs: 2_000,
        statedByServer: true
      },
      {
        method: "GET",
        url: "https://api.nexusgpt.io/api/public/v1/agents",
        attempt: 2,
        maxAttempts: 3,
        status: 429,
        delayMs: 499,
        statedByServer: false
      }
    ]);
  });

  it("reports nothing at all when nothing was retried", async () => {
    const h = harness([{ status: 200 }]);

    await h.http.request("GET", "/agents");
    expect(h.notices).toEqual([]);
  });

  it("does not announce a refusal as a wait — no notice fires when we decline", async () => {
    const h = harness([{ status: 429, retryAfter: "3600" }]);

    await h.http.request("GET", "/agents").catch(() => undefined);
    expect(h.notices).toEqual([]);
  });

  it("survives a callback that throws — reporting a retry cannot fail the request", async () => {
    const h = harness([{ status: 429, retryAfter: "1" }, { status: 200 }], {
      onRetry: () => {
        throw new Error("the consumer's logger blew up");
      }
    });

    await expect(h.http.request("GET", "/agents")).resolves.toEqual({ ok: true });
    expect(h.calls.length).toBe(2);
  });

  it("reports a transport retry too, with no status to name", async () => {
    const calls: string[] = [];
    const notices: Array<Record<string, unknown>> = [];
    const fetchFn = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      calls.push(String(init?.method ?? "GET"));
      if (calls.length === 1) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ success: true, data: { ok: true } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    const http = new HttpClient({
      baseUrl: "https://api.nexusgpt.io",
      apiKey: "nxs_test",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
      random: () => 0.999999,
      sleep: async () => undefined,
      onRetry: (n) => notices.push({ ...n })
    });

    await expect(http.request("GET", "/agents")).resolves.toEqual({ ok: true });
    expect(notices).toEqual([
      {
        method: "GET",
        url: "https://api.nexusgpt.io/api/public/v1/agents",
        attempt: 1,
        maxAttempts: 3,
        status: undefined,
        delayMs: 249,
        statedByServer: false
      }
    ]);
  });
});
