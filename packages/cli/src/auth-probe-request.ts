import type { CredentialProbe, LiveIdentity } from "./auth-probe-outcome";

/**
 * THE ASK ITSELF: at most two HTTP requests, and never a throw.
 *
 * `auth-probe.ts` is the specifier every caller uses and carries why this
 * mapping is shared rather than copied per verb; `auth-probe-outcome.ts` owns
 * what the answers mean. This file is only the asking.
 */

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
 *
 * ⚠️ `commands/global-timeout-wiring.test.ts` HOLDS A LEDGER ROW KEYED ON THIS
 * FILE'S PATH AND THIS CALL'S ARGUMENTS — `auth-probe-request.ts -> fetch(url,
 * init)` — because the walk cannot read an init it did not see built. Moving
 * this adapter moves that key.
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
 * arm of {@link CredentialProbe}.
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
