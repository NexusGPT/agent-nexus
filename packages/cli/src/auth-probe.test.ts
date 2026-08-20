/**
 * `auth status` MUST BE ABLE TO FAIL ON THE STATE IT REPORTS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THESE ASSERT, AND WHY IT IS A RULE RATHER THAN A LIST
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The defect was `nexus auth status` exiting `0` over a key the API had already
 * stopped accepting. A test enumerating "these commands verify" would go vacuous
 * the moment somebody renamed one, and would say nothing at all about a NEW
 * outcome that nobody mapped. So the population here is derived from the TYPE:
 * {@link SAMPLES} is a `Record` keyed by `CredentialProbe["outcome"]`, so adding
 * an outcome to the union and not sampling it is a COMPILE error, not a silently
 * smaller test.
 *
 * Three invariants, each stated as a rule over that whole population:
 *
 *   1. A refusal exists for exactly the non-verified outcomes. Not "these five
 *      have one" — `iff`, walked over every member.
 *   2. Every refusal exits NON-ZERO, and with a code the taxonomy declares.
 *   3. 🚨 UNREACHABLE AND TIMED-OUT ARE NEVER REPORTED AS `not-authenticated`.
 *      This is the one that matters most and the easiest to regress: a bare
 *      `catch` around a `fetch` maps a dead network to whatever branch it falls
 *      into, and "your key is invalid" sends the reader to replace a credential
 *      that is fine. The actions are opposite, so the codes must be too.
 *
 * ── THE NEGATIVE CONTROLS ────────────────────────────────────────────────────
 *
 * Every arm below is also proved to be capable of failing, because the whole
 * class of bug being fixed here is an assertion that cannot fail. The `probes`
 * block drives real HTTP shapes through an injected fetch and checks the
 * outcome, so a mapping that collapsed two statuses into one turns these red
 * rather than green.
 */
import { describe, expect, it } from "vitest";

import {
  type CredentialProbe,
  probeCredential,
  type ProbeFetch,
  refusalForProbe
} from "./auth-probe";
import { EXIT_CODES, type ExitCategory, isDeclaredExitCode } from "./exit-codes";

/**
 * One sample per member of the union.
 *
 * 🚨 THE `Record` KEY IS THE GATE. Typed as `Record<CredentialProbe["outcome"],
 * CredentialProbe>`, a new outcome added to `auth-probe.ts` fails to compile
 * here until it is sampled — so the population these rules walk cannot silently
 * shrink below the union it claims to cover.
 */
const SAMPLES = {
  verified: { outcome: "verified", identity: { orgId: "org_x" } },
  "no-key": { outcome: "no-key" },
  rejected: { outcome: "rejected", status: 401 },
  "remote-error": { outcome: "remote-error", status: 503 },
  unreachable: { outcome: "unreachable" },
  "timed-out": { outcome: "timed-out" }
} as const satisfies Record<CredentialProbe["outcome"], CredentialProbe>;

const EVERY_OUTCOME = Object.values(SAMPLES) as readonly CredentialProbe[];

/** A stand-in for whatever clause the calling verb offers. */
const SKIP = "re-run with --no-verify";

describe("refusalForProbe: the rule, over every member of the union", () => {
  it("returns a refusal for exactly the outcomes that are not `verified`", () => {
    // `iff`, both directions, walked — not "the five I remembered".
    for (const probe of EVERY_OUTCOME) {
      const refusal = refusalForProbe(probe, "p", "https://api.example", SKIP);
      expect(refusal === null, `outcome ${probe.outcome}`).toBe(probe.outcome === "verified");
    }
  });

  it("gives every refusal a NON-ZERO exit code that the taxonomy declares", () => {
    for (const probe of EVERY_OUTCOME) {
      const refusal = refusalForProbe(probe, "p", "https://api.example", SKIP);
      if (!refusal) continue;

      const code = EXIT_CODES[refusal.cause satisfies ExitCategory];
      expect(code, `outcome ${probe.outcome}`).not.toBe(0);
      expect(isDeclaredExitCode(code), `outcome ${probe.outcome}`).toBe(true);
    }
  });

  it("NEVER reports an unreachable host or a timeout as a credential problem", () => {
    // The headline invariant. "Get a new key" and "check your network" are
    // opposite actions, and an instrument that cannot separate them has the same
    // defect it was built to close.
    for (const outcome of ["unreachable", "timed-out"] as const) {
      const refusal = refusalForProbe(SAMPLES[outcome], "p", "https://api.example", SKIP);
      expect(refusal?.cause, outcome).not.toBe("not-authenticated");
    }
    expect(refusalForProbe(SAMPLES.unreachable, "p", "https://api.example", SKIP)?.cause).toBe(
      "connection-failed"
    );
    expect(refusalForProbe(SAMPLES["timed-out"], "p", "https://api.example", SKIP)?.cause).toBe(
      "timed-out"
    );
    // …and the one that IS a credential problem still says so, so the assertion
    // above is not passing because nothing maps to `not-authenticated` at all.
    expect(refusalForProbe(SAMPLES.rejected, "p", "https://api.example", SKIP)?.cause).toBe(
      "not-authenticated"
    );
    expect(refusalForProbe(SAMPLES["no-key"], "p", "https://api.example", SKIP)?.cause).toBe(
      "not-authenticated"
    );
  });

  it("says which profile and which host, because a bare refusal cannot", () => {
    // Under --json a failure is the error document and nothing else, so these two
    // facts have nowhere else to go. A key that is dead against production and
    // live against staging is the confusion this removes.
    for (const probe of EVERY_OUTCOME) {
      const refusal = refusalForProbe(probe, "prod-profile", "https://api.example", SKIP);
      if (!refusal) continue;
      expect(refusal.message, `outcome ${probe.outcome}`).toContain("prod-profile");
      expect(refusal.message, `outcome ${probe.outcome}`).toContain("https://api.example");
    }
  });

  it("marks the three UNJUDGED outcomes as unjudged, rather than as a verdict", () => {
    // A server that errored, a host that did not answer and a check that ran out
    // of time all leave the credential UNMEASURED. Reading any of them as "the
    // key is bad" is the same collapse one layer along.
    for (const outcome of ["remote-error", "unreachable", "timed-out"] as const) {
      const refusal = refusalForProbe(SAMPLES[outcome], "p", "https://api.example", SKIP);
      expect(refusal?.hint, outcome).toContain("not judged");
    }
  });
});

/**
 * A deadline that never fires, so a slow double cannot make a case flaky.
 *
 * The DEADLINE is the caller's concern and is asserted where the caller builds
 * it — `timeout-values-carry-their-unit.test.ts` proves both call sites read the
 * global `--timeout`. These cases are about the MAPPING, so they hand the probe
 * a signal that only ever stays open.
 */
function never(): AbortSignal {
  return new AbortController().signal;
}

/** A fetch double that answers a fixed status, and records what it was asked. */
function fetchReturning(answers: readonly { status: number; body?: unknown }[]): {
  fetch: ProbeFetch;
  urls: string[];
} {
  const urls: string[] = [];
  let call = 0;
  const fetch: ProbeFetch = (url) => {
    urls.push(url);
    const answer = answers[Math.min(call++, answers.length - 1)];
    return Promise.resolve({
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: () => Promise.resolve(answer.body ?? {})
    });
  };
  return { fetch, urls };
}

describe("probeCredential: each wire shape reaches its own outcome", () => {
  it("verifies a good key and carries the live identity through", async () => {
    const { fetch, urls } = fetchReturning([{ status: 200, body: { data: { orgId: "org_1" } } }]);

    const probe = await probeCredential("https://api.example", "k", {
      signal: never(),
      doFetch: fetch
    });

    expect(probe).toEqual({ outcome: "verified", identity: { orgId: "org_1" } });
    expect(urls[0]).toBe("https://api.example/api/public/v1/me");
  });

  it("reports a 401 and a 403 as rejected, keeping the status", async () => {
    for (const status of [401, 403]) {
      const { fetch } = fetchReturning([{ status }]);
      await expect(
        probeCredential("https://api.example", "k", { signal: never(), doFetch: fetch })
      ).resolves.toEqual({
        outcome: "rejected",
        status
      });
    }
  });

  it("reports a 5xx as remote-error — reached, and not a verdict on the key", async () => {
    const { fetch } = fetchReturning([{ status: 503 }]);
    await expect(
      probeCredential("https://api.example", "k", { signal: never(), doFetch: fetch })
    ).resolves.toEqual({
      outcome: "remote-error",
      status: 503
    });
  });

  it("falls back to the legacy probe on a 404, and verifies with no identity", async () => {
    // A backend predating `/me`. The key is still PROVEN — a second call said so
    // — and `identity: null` means "none to report", never "no organization".
    const { fetch, urls } = fetchReturning([{ status: 404 }, { status: 200 }]);

    const probe = await probeCredential("https://api.example", "k", {
      signal: never(),
      doFetch: fetch
    });

    expect(probe).toEqual({ outcome: "verified", identity: null });
    expect(urls[1]).toBe("https://api.example/api/public/v1/agents?limit=1");
  });

  it("still reports rejected when the legacy fallback is the thing that 401s", async () => {
    const { fetch } = fetchReturning([{ status: 404 }, { status: 401 }]);
    await expect(
      probeCredential("https://api.example", "k", { signal: never(), doFetch: fetch })
    ).resolves.toEqual({
      outcome: "rejected",
      status: 401
    });
  });

  it("stays verified when a 2xx body will not parse — that is not a network failure", async () => {
    // The key is already proven: the server read it and answered 2xx. Letting the
    // parse throw into the outer catch would report `unreachable` for a host that
    // plainly answered, which is the same mislabel one field along.
    const broken: ProbeFetch = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON"))
      });

    await expect(
      probeCredential("https://api.example", "k", { signal: never(), doFetch: broken })
    ).resolves.toEqual({ outcome: "verified", identity: null });
  });

  it("refuses a blank key WITHOUT sending a request", async () => {
    // Sending it would earn a 401 and read as "the server rejected your key",
    // naming a credential the profile does not hold — true about the wrong thing.
    const { fetch, urls } = fetchReturning([{ status: 401 }]);

    await expect(
      probeCredential("https://api.example", "   ", { signal: never(), doFetch: fetch })
    ).resolves.toEqual({
      outcome: "no-key"
    });
    expect(urls).toHaveLength(0);
  });

  it("separates an unreachable host from a timeout, which one `catch` cannot", async () => {
    const dead: ProbeFetch = () => Promise.reject(new TypeError("fetch failed"));
    await expect(
      probeCredential("https://api.example", "k", { signal: never(), doFetch: dead })
    ).resolves.toEqual({
      outcome: "unreachable"
    });

    const slow: ProbeFetch = () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      return Promise.reject(err);
    };
    await expect(
      probeCredential("https://api.example", "k", { signal: never(), doFetch: slow })
    ).resolves.toEqual({
      outcome: "timed-out"
    });
  });

  it("never throws — every failure is a member of the union", async () => {
    // A throw here would land in some caller's catch and become one message
    // again, which is the shape this module replaced.
    const hostile: ProbeFetch = () => {
      throw new Error("synchronous explosion");
    };
    await expect(
      probeCredential("https://api.example", "k", { signal: never(), doFetch: hostile })
    ).resolves.toMatchObject({
      outcome: "unreachable"
    });
  });
});

describe("a refusal never names a flag the command that produced it lacks", () => {
  it("omits the skip clause entirely when the caller has no way to skip", () => {
    // `auth whoami` passes `null`: verifying live IS the command, so there is no
    // flag to name. The helper hardcoded `--no-verify` and both verbs shared it,
    // which pointed a `whoami` network failure at an invocation commander
    // rejects. Extracting shared code moved a CALLER-SPECIFIC sentence into the
    // shared copy, where it went silently wrong for the caller that differed.
    for (const probe of EVERY_OUTCOME) {
      const refusal = refusalForProbe(probe, "p", "https://api.example", null);
      if (!refusal) continue;
      expect(refusal.hint ?? "", `outcome ${probe.outcome}`).not.toContain("--no-verify");
    }
  });

  it("still gives the unjudged outcomes their advice when the caller has one", () => {
    // The negative control for the case above: if the clause were dropped
    // unconditionally, the assertion above would pass over a helper that had
    // stopped advising anybody at all.
    for (const outcome of ["remote-error", "unreachable", "timed-out"] as const) {
      const refusal = refusalForProbe(SAMPLES[outcome], "p", "https://api.example", SKIP);
      expect(refusal?.hint, outcome).toContain("--no-verify");
    }
  });
});
