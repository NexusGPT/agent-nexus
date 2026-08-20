/**
 * THE ONE PLACE THIS CLI ASKS "IS THIS CREDENTIAL GOOD", AND THE ONLY PLACE THAT
 * DECIDES WHAT THE ANSWER MEANS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A STATUS VERB THAT EXITS 0 OVER A DEAD KEY IS WORSE THAN NO STATUS VERB.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus auth status` read local config, found a key, and exited `0` — over a
 * key the API had already stopped accepting. Measured: a stored key pointed at
 * production, `auth status` reported success, and the 63 API calls that followed
 * all failed on auth. A preflight gated on that exit code passed and then
 * watched everything behind it break.
 *
 * That is the expensive shape, not merely a useless one. The verb's whole
 * purpose is to answer "is my credential good"; answering `0` when it is not
 * converts "your key is dead" — a one-command fix — into "something else is
 * wrong", and the debugging time goes somewhere the defect is not.
 *
 * ── WHY THE PROBE IS ITS OWN MODULE ──────────────────────────────────────────
 *
 * `auth whoami` already got this right, in its own copy: it called `/me`, mapped
 * 401/403 to a refusal, and refused to print "Authenticated." on a network
 * error. `auth status` had no copy at all. The cure for one verb being wrong is
 * not a second private copy of the correct logic — two copies of a security
 * answer are two things to drift, and the drift is silent in the direction that
 * reads as fine.
 *
 * So both verbs call {@link probeCredential} and neither owns the mapping. A
 * change to what "rejected" means reaches both, or it reaches neither.
 *
 * ── THE OUTCOMES ARE SEPARATE BECAUSE THE ACTIONS ARE OPPOSITE ───────────────
 *
 * ⚠️ "THE SERVER IS UNREACHABLE" MUST NEVER BE REPORTED AS "YOUR KEY IS
 * INVALID". One says get a new key; the other says check your network. An
 * instrument that collapses them has the same defect it was built to fix, one
 * layer down — the reader still cannot tell which thing to go and do.
 *
 * The union below therefore keeps FIVE distinct failures rather than a boolean,
 * and each maps to its own category in `exit-codes.ts`:
 *
 * | outcome       | what happened                       | what to do            |
 * | ------------- | ----------------------------------- | --------------------- |
 * | `no-key`      | the profile stores no key at all    | log in                |
 * | `rejected`    | the server read the key and said no | get a new key         |
 * | `remote-error`| the server was reached and broke    | retry later           |
 * | `unreachable` | nothing answered — DNS, TLS, socket | check the network     |
 * | `timed-out`   | it answered too slowly, or not yet  | retry, and re-read it |
 *
 * `timed-out` is deliberately NOT folded into `unreachable`, even though a bare
 * `catch` sees them as one throw. A timeout leaves the request possibly still
 * running server-side; an unreachable host does not. `whoami` collapsed the two
 * before this module existed.
 *
 * ── WHAT `verified` DOES NOT PROVE ───────────────────────────────────────────
 *
 * That the key authenticates against THIS base URL, right now. It is not a
 * statement about permissions, about the organization the next request will
 * name, or about any other host. The caller still reports those from its own
 * resolution.
 */

/** The identity `/me` reports, when the endpoint exists and the key is good. */
export interface LiveIdentity {
  orgId?: string;
  orgName?: string;
  userEmail?: string;
  userName?: string;
  role?: string;
}

/**
 * What a live probe found. A closed union, so a caller cannot handle "the good
 * one" and let every failure fall through a default — the shape that produced
 * the defect this module exists to close.
 */
export type CredentialProbe =
  /**
   * The server read the key and accepted it.
   *
   * `identity` is `null` on a backend too old to serve `/me`: the key is still
   * PROVEN good — a second call confirmed it — and there is simply no live
   * identity to report. A caller must fall back to its stored fields there, and
   * must not read `null` as "no organization".
   */
  | { readonly outcome: "verified"; readonly identity: LiveIdentity | null }
  /** The profile holds no key. Refused locally; no request was sent. */
  | { readonly outcome: "no-key" }
  /** The server read the key and refused it. HTTP 401 or 403. */
  | { readonly outcome: "rejected"; readonly status: number }
  /** The request arrived and the server failed it. Any other non-2xx. */
  | { readonly outcome: "remote-error"; readonly status: number }
  /** Nothing answered — DNS, TLS, socket, offline. Retryable. */
  | { readonly outcome: "unreachable" }
  /** The CLI stopped waiting. The request may still be running. */
  | { readonly outcome: "timed-out" };

/**
 * How long a verification waits when `--timeout` is not given. MILLISECONDS.
 *
 * A DEFAULT, never a ceiling — the caller builds the deadline and the global
 * `--timeout <seconds>` moves it. `docs.ts` records the defect that distinction
 * exists to prevent: a fetch pinning its own deadline makes the CLI's own advice
 * to raise `--timeout` a false instruction.
 *
 * Named `*_MS` on purpose. `AbortSignal.timeout` takes MILLISECONDS, and
 * `timeout-values-carry-their-unit.test.ts` enforces that a millisecond slot is
 * fed either `timeoutSecondsToMs(...)` or a `*_MS` constant.
 */
export const AUTH_PROBE_DEFAULT_TIMEOUT_MS = 30_000;

/**
 * A `fetch` with the shape this module needs, so a test can hand one in.
 *
 * Typed structurally rather than as `typeof fetch`: the probe reads a status and
 * a body and nothing else, so demanding the full DOM signature would force every
 * double to build a `Response` nobody reads — and would only be satisfiable with
 * an assertion, which is the contract-shaped hole this package refuses.
 */
export type ProbeFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * The real `fetch`, narrowed to {@link ProbeFetch} by an ADAPTER rather than by
 * an assertion.
 *
 * `fetch as unknown as ProbeFetch` would compile and would be a lie the type
 * checker stops reading: it claims a shape nobody verified. Reading the three
 * fields the probe actually uses states the same narrowing in code the compiler
 * checks.
 */
const realFetch: ProbeFetch = async (url, init) => {
  const res = await fetch(url, init);
  return { ok: res.ok, status: res.status, json: () => res.json() };
};

/**
 * Is this throw a timeout rather than an unreachable host?
 *
 * `AbortSignal.timeout` rejects with a `DOMException` named `TimeoutError`, and
 * an aborted fetch rejects with `AbortError`. Both arrive at the same `catch` as
 * an unreachable host does, which is exactly why a bare `catch` cannot tell the
 * caller which of the two happened.
 */
function isTimeout(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/**
 * Ask the API whether `apiKey` is good, against `baseUrl`, right now.
 *
 * Sends at most two requests: `/me`, and — only when that answers 404, meaning a
 * backend predating the endpoint — a plain `agents?limit=1` validity probe. The
 * fallback proves the key and yields no identity, which is the `identity: null`
 * arm above.
 *
 * Never throws. Every failure is a member of the union, because a throw here
 * would land in some caller's `catch` and become one message again.
 */
export async function probeCredential(
  baseUrl: string,
  apiKey: string,
  options: { readonly signal: AbortSignal; readonly doFetch?: ProbeFetch }
): Promise<CredentialProbe> {
  // A blank key is refused WITHOUT a request. Sending it would return 401 and
  // read as "the server rejected your key", pointing at a credential the profile
  // does not actually hold — a true statement about the wrong thing.
  if (apiKey.trim() === "") return { outcome: "no-key" };

  const doFetch = options.doFetch ?? realFetch;
  // ONE deadline for the whole verification, not one per request. The 404
  // fallback below is a second round trip on the same question, and giving it a
  // fresh clock would let `--timeout 5` take eleven seconds.
  const requestInit = {
    headers: { "api-key": apiKey, Accept: "application/json" },
    signal: options.signal
  };

  try {
    const res = await doFetch(`${baseUrl}/api/public/v1/me`, requestInit);

    if (res.status === 401 || res.status === 403) {
      return { outcome: "rejected", status: res.status };
    }

    if (res.ok) {
      // The KEY is already proven at this point — the server read it and
      // answered 2xx. A body that will not parse is a fact about the response,
      // never about the credential, so it stays `verified` with no identity
      // rather than falling to the outer catch and reporting "unreachable" for a
      // host that plainly answered.
      let identity: LiveIdentity | null = null;
      try {
        identity = ((await res.json()) as { data?: LiveIdentity }).data ?? null;
      } catch {
        identity = null;
      }
      return { outcome: "verified", identity };
    }

    if (res.status === 404) {
      const probe = await doFetch(`${baseUrl}/api/public/v1/agents?limit=1`, requestInit);
      if (probe.status === 401 || probe.status === 403) {
        return { outcome: "rejected", status: probe.status };
      }
      if (!probe.ok) return { outcome: "remote-error", status: probe.status };
      return { outcome: "verified", identity: null };
    }

    return { outcome: "remote-error", status: res.status };
  } catch (err) {
    return isTimeout(err) ? { outcome: "timed-out" } : { outcome: "unreachable" };
  }
}

/** A probe outcome, as the arguments `reportFailure` takes. */
export interface ProbeRefusal {
  readonly cause: "not-authenticated" | "connection-failed" | "timed-out" | "remote-error";
  readonly message: string;
  readonly hint?: string;
}

/**
 * Turn a failed probe into the refusal it means, naming the profile and the host.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE MESSAGE CARRIES THE PROFILE AND THE BASE URL ON PURPOSE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Under `--json` a failure is the error document and NOTHING ELSE — one document
 * on stdout is a STABLE promise of this CLI. So the profile name and the host,
 * which the success document reports as fields, have nowhere else to go on the
 * one path where the reader needs them most: "some key is dead" is not
 * actionable, and "the key in profile X, against host Y, is dead" is.
 *
 * A key that is dead against production and live against staging is the exact
 * confusion this sentence removes.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `skipAdvice` IS REQUIRED, AND `null` IS A REAL ANSWER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The three UNJUDGED outcomes want to tell the reader how to get past the check.
 * That advice is a property of THE VERB THEY RAN, not of the probe: `auth status`
 * declares `--no-verify` and `auth whoami` does not.
 *
 * This helper hardcoded ", or re-run with --no-verify" and both verbs shared it,
 * so a network failure from `whoami` pointed at a flag commander rejects — a
 * hint that sends the reader to an error. Found by review, on a helper extracted
 * to REMOVE drift: sharing correct code moves the caller-specific parts into the
 * shared copy, where they silently become wrong for the caller that differs.
 *
 * So the caller passes its own sentence, or `null` for "this verb offers no way
 * to skip". Required rather than optional, because a new caller that never
 * thought about it would otherwise inherit `status`'s flag by default — which is
 * exactly the defect, restored by omission.
 *
 * @param probe a NON-verified outcome. `verified` is not a refusal and returns
 * `null`, so a caller that forgets to branch gets a type error rather than a
 * refusal describing a success.
 * @param skipAdvice a clause naming how THIS command skips the check, already
 * worded to follow a comma — or `null` when it cannot be skipped.
 */
export function refusalForProbe(
  probe: CredentialProbe,
  profileName: string,
  baseUrl: string,
  skipAdvice: string | null
): ProbeRefusal | null {
  const where = `profile "${profileName}" against ${baseUrl}`;
  // Built once so every unjudged hint ends the same way, and so a verb with no
  // skip route simply gets the sentence without the clause.
  const orSkip = skipAdvice === null ? "" : `, or ${skipAdvice}`;

  switch (probe.outcome) {
    case "verified":
      return null;
    case "no-key":
      return {
        cause: "not-authenticated",
        message: `No API key stored in ${where}.`,
        hint: "Run: nexus auth login"
      };
    case "rejected":
      return {
        cause: "not-authenticated",
        message: `The API key in ${where} was rejected (HTTP ${String(probe.status)}) — it is invalid, expired or revoked.`,
        hint: "Run: nexus auth login"
      };
    case "remote-error":
      return {
        cause: "remote-error",
        message: `Could not verify the key in ${where}: the server answered HTTP ${String(probe.status)}.`,
        hint: `The credential was not judged. Try again${orSkip}.`
      };
    case "unreachable":
      return {
        cause: "connection-failed",
        message: `Could not reach ${baseUrl} to verify the key in profile "${profileName}".`,
        // Named apart from a rejection deliberately — the reader must not go and
        // fetch a new key because their network is down.
        hint: `The credential was not judged. Check your connection${orSkip}.`
      };
    case "timed-out":
      return {
        cause: "timed-out",
        message: `Timed out verifying the key in ${where}.`,
        // Naming the flag rather than a number: the deadline is the caller's, so
        // a duration written here would be wrong the moment anyone passes one.
        // `--timeout` is a GLOBAL flag, so it is safe to name for every caller —
        // unlike the skip advice, which is per-verb.
        hint: `The credential was not judged. Raise --timeout <seconds>${orSkip}.`
      };
  }
}
