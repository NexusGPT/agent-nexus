import { describe, expect, it } from "vitest";

import { createBrowserChatClient } from "./browser-chat";
import type { DeprecationNotice } from "./deprecation";
import type { RetryNotice } from "./http-client";
import type { ContractReport, RouteShapeManifest } from "./response-contract";

/**
 * The four observers `createBrowserChatClient` threads into its `HttpClient`.
 *
 * ## What this file protects
 *
 * `BrowserChatClientOptions` declared only `baseUrl`, `fetch`, `timeout` and
 * `defaultHeaders`, so a browser embed could not supply an observer AT ALL.
 * `onRetry`, `onDeprecation`, `onResponseContract` and `responseContract` were
 * added and threaded into the `new HttpClient({ … })` call. Each of those four
 * threading lines is one word of plumbing with no type error behind its
 * deletion: the members stay optional, the factory keeps compiling, the client
 * keeps working, and every observer simply stops firing. **Nothing but an arm
 * here can notice that**, which is why there is one arm per member and why each
 * one was watched to go red against the line deleted.
 *
 * ## Why 429, and why a POST
 *
 * `isRetryableStatus` in `./retry-policy` answers `true` for a 429 on ANY
 * method and for 502/503/504 only on `IDEMPOTENT_METHODS` — GET/HEAD/OPTIONS/
 * PUT/DELETE, with POST and PATCH excluded on purpose because replaying a POST
 * whose outcome is unknown duplicates its effect. So a 502-on-POST arm never
 * retries, never reaches `onRetry`, and passes identically with the wiring
 * deleted. The CONTROL arm below measures exactly that, so the choice of pair
 * is evidence in the file rather than a claim in a commit message.
 *
 * `refresh()` is the POST used because it is a plain JSON request/response —
 * `stream()` and `streamRaw()` are the same verb through SSE, and the retry
 * loop they share is the subject either way.
 *
 * ## Why the backoff is NOT injected
 *
 * `HttpClientOptions` carries an injectable `sleep` and an injectable `random`,
 * and `BrowserChatClientOptions` deliberately exposes NEITHER — they are not
 * part of the surface a browser consumer has. So these arms pay the real
 * backoff: full-jitter from `[0, DEFAULT_RETRY_BASE_DELAY_MS)`, under 250 ms for
 * the one retry each arm takes. Widening the public type to make a test faster
 * would be the test dictating the API, so the wait is paid instead.
 */

const BASE_URL = "https://api.nexusgpt.io";
const V1 = `${BASE_URL}/api/public/v1`;
const DEPLOYMENT_ID = "dep_browser";
const AUTH = { token: "cst_browser" } as const;

/** What `POST /chat-session/refresh` answers. */
const SESSION = {
  token: "cst_successor",
  sessionId: "ses_1",
  chatId: "cht_1",
  expiresInSeconds: 900
} as const;

/** What `GET /chat/status` answers — every field of `ChatTurnStatus`. */
const TURN_STATUS = {
  turnId: "trn_1",
  running: false,
  outcome: "completed",
  lastEventId: "7",
  frameCount: 17
} as const;

const RATE_LIMITED_BODY = JSON.stringify({
  success: false,
  error: { code: "RATE_LIMITED", message: "too many requests" }
});

/**
 * One retirement signal, in the order a server actually announces one.
 *
 * Deprecated 2026-08-30, sunset three months LATER — not the other way round,
 * which is what a hand-typed pair drifts into and what makes a reader stop and
 * wonder whether the arm is testing anything real. `Deprecation` carries the
 * RFC 8941 sf-date form (`@` then Unix SECONDS), the only form
 * `parseDeprecationHeader` accepts; `Sunset` carries an RFC 7231 IMF-fixdate.
 *
 * ⚠️ The weekday is the TRUE weekday for that date, and it had to be computed
 * rather than typed: `parseSunsetHeader` delegates to `Date`, which parses a
 * WRONG weekday just as happily and reports no error — so a fixture reading
 * `Mon` for a Thursday would assert correctly over a value no server emits,
 * and nothing in the suite would catch it.
 */
const RETIREMENT_HEADERS = {
  Deprecation: "@1788048000",
  Sunset: "Mon, 30 Nov 2026 00:00:00 GMT"
} as const;

/**
 * The two values above as the notice's PARSED fields.
 *
 * Written out independently rather than derived from the header strings: a
 * value computed by the same expression the subject uses would agree with the
 * subject whatever either of them did.
 */
const DEPRECATED_AT_MS = 1_788_048_000_000;
const SUNSET_AT_ISO = "2026-11-30T00:00:00.000Z";

/**
 * One scripted `fetch` answer.
 *
 * `contentType` is settable because a proxy status is the one answer that is
 * NOT JSON — 502/503/504 are served as HTML by nearly every load balancer, and
 * the CONTROL arm asserts against that real shape rather than a tidy envelope.
 */
interface ScriptedAnswer {
  readonly status: number;
  readonly body: string;
  readonly contentType?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

interface RecordedCall {
  readonly url: string;
  readonly method: string;
}

interface FetchStub {
  /** Handed to the factory as `fetch`, so a call that never reaches it is visible. */
  readonly fetch: typeof globalThis.fetch;
  /** One entry per attempt actually made, in order. */
  readonly calls: readonly RecordedCall[];
}

/**
 * A `fetch` that answers the script in order and repeats its last entry.
 *
 * Repeating rather than throwing on exhaustion is deliberate: a throw inside
 * `fetch` is classified by the transport as a connection failure, which would
 * make an over-long retry sequence surface as a *different* defect instead of
 * as a call count. Every arm asserts `calls.length`, so an extra attempt is
 * caught by the number rather than by an exception shape.
 */
function scriptedFetch(script: readonly ScriptedAnswer[]): FetchStub {
  const calls: RecordedCall[] = [];
  let next = 0;

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const answer = script[Math.min(next, script.length - 1)];
    next += 1;
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    if (answer === undefined) throw new Error("scriptedFetch was given an empty script");
    return new Response(answer.body, {
      status: answer.status,
      headers: {
        "content-type": answer.contentType ?? "application/json",
        ...answer.headers
      }
    });
  };

  return { fetch, calls };
}

function envelope(data: unknown): string {
  return JSON.stringify({ success: true, data });
}

/**
 * A one-route manifest covering `GET /deployments/:deploymentId/chat/status`.
 *
 * Hand-written rather than lifted from `./v1-response-contract`: the subject is
 * the THREADING of whatever manifest a consumer supplies, so the smallest
 * manifest that can produce each of the three verdicts is the honest fixture.
 * Field codes are `TYPE_LETTER` letters from `./response-contract` — `b`oolean,
 * `n`umber, `0`null, `s`tring — sorted, as a `FieldTypeCode` is.
 */
const STATUS_MANIFEST: RouteShapeManifest = {
  ChatStatus: {
    name: "ChatStatus",
    method: "GET",
    path: "/deployments/:deploymentId/chat/status",
    payload: {
      kind: "object",
      fields: {
        turnId: "0s",
        running: "b",
        outcome: "0s",
        lastEventId: "0s",
        frameCount: "n"
      },
      required: ["turnId", "running", "outcome", "lastEventId", "frameCount"]
    }
  }
};

describe("createBrowserChatClient — onRetry reaches the transport", () => {
  it("fires the consumer's callback when a 429 is replayed", async () => {
    const stub = scriptedFetch([
      { status: 429, body: RATE_LIMITED_BODY },
      { status: 200, body: envelope(SESSION) }
    ]);
    const notices: RetryNotice[] = [];

    const chat = createBrowserChatClient({
      baseUrl: BASE_URL,
      fetch: stub.fetch,
      onRetry: (notice) => void notices.push(notice)
    });

    await expect(chat.refresh(DEPLOYMENT_ID, AUTH)).resolves.toEqual(SESSION);
    // Positive control on the haystack: the replay really happened, so a zero
    // below means the notice was LOST and not that there was nothing to report.
    // Without it, `onRetry` never firing is indistinguishable from a 429 that
    // was never retried in the first place.
    expect(stub.calls).toHaveLength(2);
    expect(notices).toHaveLength(1);
  });

  it("hands it the attempt, the status and where the wait came from", async () => {
    const stub = scriptedFetch([
      { status: 429, body: RATE_LIMITED_BODY },
      { status: 200, body: envelope(SESSION) }
    ]);
    const notices: RetryNotice[] = [];

    const chat = createBrowserChatClient({
      baseUrl: BASE_URL,
      fetch: stub.fetch,
      onRetry: (notice) => void notices.push(notice)
    });
    await chat.refresh(DEPLOYMENT_ID, AUTH);

    // `DEFAULT_MAX_RETRIES` is 2 and this factory passes no `maxRetries`, so
    // three attempts is what a browser embed gets and `maxAttempts` must say so.
    expect(notices[0]).toMatchObject({
      method: "POST",
      url: `${V1}/deployments/${DEPLOYMENT_ID}/chat-session/refresh`,
      attempt: 1,
      maxAttempts: 3,
      status: 429,
      statedByServer: false
    });
  });

  it("CONTROL: a 502 on the SAME POST is not replayed, so it could not have proven anything", async () => {
    // This is why the arms above use 429. `PROXY_STATUSES` are retryable only
    // for `IDEMPOTENT_METHODS`, and POST is excluded on purpose — so an arm
    // built on 502-and-a-POST reaches no retry, reaches `onRetry` never, and
    // passes byte-for-byte with the `onRetry: opts.onRetry` line deleted.
    const stub = scriptedFetch([
      { status: 502, body: "<html>502 Bad Gateway</html>", contentType: "text/html" }
    ]);
    const notices: RetryNotice[] = [];

    const chat = createBrowserChatClient({
      baseUrl: BASE_URL,
      fetch: stub.fetch,
      onRetry: (notice) => void notices.push(notice)
    });

    await expect(chat.refresh(DEPLOYMENT_ID, AUTH)).rejects.toThrow();
    expect(stub.calls).toHaveLength(1);
    expect(notices).toHaveLength(0);
  });
});

describe("createBrowserChatClient — onDeprecation reaches the transport", () => {
  it("fires the consumer's callback when a chat response carries the headers", async () => {
    const stub = scriptedFetch([
      {
        status: 200,
        body: envelope(TURN_STATUS),
        headers: RETIREMENT_HEADERS
      }
    ]);
    const notices: DeprecationNotice[] = [];

    const chat = createBrowserChatClient({
      baseUrl: BASE_URL,
      fetch: stub.fetch,
      onDeprecation: (notice) => void notices.push(notice)
    });

    await expect(chat.status(DEPLOYMENT_ID, AUTH)).resolves.toEqual(TURN_STATUS);
    expect(stub.calls).toHaveLength(1);
    expect(notices).toHaveLength(1);
  });

  it("hands it both raw values and both parsed dates", async () => {
    const stub = scriptedFetch([
      {
        status: 200,
        body: envelope(TURN_STATUS),
        headers: RETIREMENT_HEADERS
      }
    ]);
    const notices: DeprecationNotice[] = [];

    const chat = createBrowserChatClient({
      baseUrl: BASE_URL,
      fetch: stub.fetch,
      onDeprecation: (notice) => void notices.push(notice)
    });
    await chat.status(DEPLOYMENT_ID, AUTH);

    expect(notices[0]).toMatchObject({
      method: "GET",
      url: `${V1}/deployments/${DEPLOYMENT_ID}/chat/status`,
      deprecation: RETIREMENT_HEADERS.Deprecation,
      sunset: RETIREMENT_HEADERS.Sunset
    });
    expect(notices[0]?.deprecatedAt?.getTime()).toBe(DEPRECATED_AT_MS);
    expect(notices[0]?.sunsetAt?.toISOString()).toBe(SUNSET_AT_ISO);
  });

  it("CONTROL: a response carrying NEITHER header reports nothing", async () => {
    // The negative half of the arm above, and the arm that stops `toHaveLength(1)`
    // from being satisfiable by a transport that reports on every response.
    const stub = scriptedFetch([{ status: 200, body: envelope(TURN_STATUS) }]);
    const notices: DeprecationNotice[] = [];

    const chat = createBrowserChatClient({
      baseUrl: BASE_URL,
      fetch: stub.fetch,
      onDeprecation: (notice) => void notices.push(notice)
    });
    await chat.status(DEPLOYMENT_ID, AUTH);

    expect(stub.calls).toHaveLength(1);
    expect(notices).toHaveLength(0);
  });
});

describe("createBrowserChatClient — the reporter and its manifest are ONE pair", () => {
  it("reports `unchecked` naming the subpath when a reporter arrives with no manifest", async () => {
    const stub = scriptedFetch([{ status: 200, body: envelope(TURN_STATUS) }]);
    const reports: ContractReport[] = [];

    // `responseContract` is deliberately absent. An observer that observes
    // nothing must say so, or its silence is indistinguishable from a contract
    // that passed — which is the drift the feature exists to detect.
    const chat = createBrowserChatClient({
      baseUrl: BASE_URL,
      fetch: stub.fetch,
      onResponseContract: (report) => void reports.push(report)
    });

    await expect(chat.status(DEPLOYMENT_ID, AUTH)).resolves.toEqual(TURN_STATUS);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      state: "unchecked",
      route: null,
      method: "GET",
      path: `/deployments/${DEPLOYMENT_ID}/chat/status`
    });
    // The reason is asserted as the substring naming the remedy, read off
    // `http-client.ts`'s `reportContract`. It is spelled as BARE PROSE there
    // and must stay that way: `scripts/assert-published-imports.mjs` scans the
    // emitted bundle for module specifiers, so writing it as an import reads as
    // this package importing itself and fails the build.
    expect(reports[0]?.reason).toContain(
      "set `responseContract` to the `V1_RESPONSE_CONTRACT` exported by the " +
        "@agent-nexus/sdk/v1-response-contract subpath"
    );
  });

  it("reports `passed` against a route the supplied manifest knows", async () => {
    const stub = scriptedFetch([{ status: 200, body: envelope(TURN_STATUS) }]);
    const reports: ContractReport[] = [];

    const chat = createBrowserChatClient({
      baseUrl: BASE_URL,
      fetch: stub.fetch,
      onResponseContract: (report) => void reports.push(report),
      responseContract: STATUS_MANIFEST
    });

    await expect(chat.status(DEPLOYMENT_ID, AUTH)).resolves.toEqual(TURN_STATUS);
    expect(reports).toHaveLength(1);
    // Stated as the combination it EXCLUDES, because `state` has three members
    // and only one of them is this one. `passed` beside the route's own name
    // excludes BOTH halves of the pair going missing: a reporter that was never
    // threaded reports nothing at all, and a manifest that was never threaded
    // reports `unchecked` with `route: null` — which the arm above pins, and
    // which "the reporter was called" would have accepted.
    expect(reports[0]).toMatchObject({ state: "passed", route: "ChatStatus" });
  });

  it("CONTROL: a payload that violates the manifest reports `mismatch`, so `passed` is earned", async () => {
    // Without this, `passed` could be the verdict a route match returns for any
    // payload whatsoever, and the arm above would be pinning the route lookup
    // rather than the check.
    const stub = scriptedFetch([
      { status: 200, body: envelope({ ...TURN_STATUS, running: "yes", frameCount: null }) }
    ]);
    const reports: ContractReport[] = [];

    const chat = createBrowserChatClient({
      baseUrl: BASE_URL,
      fetch: stub.fetch,
      onResponseContract: (report) => void reports.push(report),
      responseContract: STATUS_MANIFEST
    });
    await chat.status(DEPLOYMENT_ID, AUTH);

    expect(reports[0]).toMatchObject({ state: "mismatch", route: "ChatStatus", issueCount: 2 });
    expect(reports[0]?.issues?.map((issue) => issue.at)).toEqual(["running", "frameCount"]);
  });

  it("CONTROL: a manifest with no reporter beside it reports nothing and changes nothing", async () => {
    // The other direction of the pair. The manifest alone must not start
    // spending cycles or start reporting — installing the reporter is what
    // turns the check on.
    const stub = scriptedFetch([{ status: 200, body: envelope(TURN_STATUS) }]);

    const chat = createBrowserChatClient({
      baseUrl: BASE_URL,
      fetch: stub.fetch,
      responseContract: STATUS_MANIFEST
    });

    await expect(chat.status(DEPLOYMENT_ID, AUTH)).resolves.toEqual(TURN_STATUS);
    expect(stub.calls).toHaveLength(1);
  });
});
