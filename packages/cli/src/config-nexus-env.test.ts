import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `NEXUS_ENV` NAMES AN ENVIRONMENT, AND AN UNKNOWN NAME USED TO NAME PRODUCTION.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT WENT WRONG (NEX-5919)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Both resolvers ended on `MAP[env] ?? MAP.production`, over two independent
 * `Record<string, string>` literals that had no `staging` key. So
 *
 *   NEXUS_ENV=staging nexus admin vibe-cost-safety set <orgId> --status OK
 *
 * wrote to PRODUCTION: exit 0, no error, and nothing on screen naming the host.
 * Every typo — `prod`, `stagin`, `Production` — did the same thing. The
 * fallback made an unknown name INDISTINGUISHABLE from the default, which is
 * the one case where they must differ: an unset variable is a user who never
 * chose, and a set one is a user who chose and was overruled in silence.
 *
 * ── WHY THESE ARMS AND NOT A TYPE ────────────────────────────────────────────
 *
 * `Record<NexusEnvName, string>` proves every KEY is present. It says nothing
 * about any VALUE being right — a map whose every entry named the production
 * host typechecks clean and is the defect restored. Exhaustiveness is necessary
 * and it is not sufficient, so the hosts are asserted here, by value, against
 * the real exported subject rather than a local copy of the table.
 *
 * ── THE HOSTS, AND WHERE THEY COME FROM ──────────────────────────────────────
 *
 * `deployment/README.md`'s per-environment table, read down both columns:
 * production pairs `https://gpt.nexus` with `https://api.nexusgpt.io`, staging
 * pairs `https://staging.gpt.nexus` with `https://api-staging.gpt.nexus`. The
 * production pair is byte-identical to what this CLI already shipped, which is
 * what makes the staging row of the same table the right source for the other.
 *
 * ⚠️ PRODUCTION AND STAGING ARE ON DIFFERENT REGISTRABLE DOMAINS. That is the
 * deployment and not a slip: `api-staging.nexusgpt.io` is a host nobody serves.
 */
import { resolveBaseUrl, resolveDashboardUrl } from "./config";
import { CategorizedCliError } from "./exit-codes";

/**
 * A HOME with no `.nexus-mcp/config.json` in it, so both resolvers fall all the
 * way through to the `NEXUS_ENV` term — the one under test.
 *
 * 🚨 SET BEFORE THE IMPORTS ABOVE RUN. `config.ts` computes its config
 * directory from `os.homedir()` at MODULE LOAD, so moving `HOME` inside a
 * `beforeEach` is too late: every case would read the developer's REAL config,
 * find a profile, and return that profile's host — green, and about nothing.
 * `base-url-precedence.test.ts` measured this and is written the same way.
 */
const SANDBOX = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-env-map-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

const PRODUCTION_API = "https://api.nexusgpt.io";
const PRODUCTION_DASHBOARD = "https://gpt.nexus";

/** The hosts each accepted name must resolve to. The subject is `config.ts`. */
const EXPECTED = {
  production: { api: PRODUCTION_API, dashboard: PRODUCTION_DASHBOARD },
  staging: { api: "https://api-staging.gpt.nexus", dashboard: "https://staging.gpt.nexus" },
  dev: { api: "http://localhost:3001", dashboard: "http://localhost:3000" }
} as const;

/**
 * A resolver's answer, or the error it refused with — never a throw.
 *
 * 🔴 `expect.soft` RECORDS AN ASSERTION FAILURE AND DOES NOT CATCH AN ORDINARY
 * THROW. Calling a resolver inside an `expect.soft(…)` argument therefore
 * aborts its whole block the moment the resolver refuses, leaving every soft
 * arm below it UNSCORED while the block still reds and reads as a kill. Turning
 * the refusal into a value is what makes each arm in a loop score separately.
 */
function answerOf(resolve: () => string): string | Error {
  try {
    return resolve();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

beforeEach(() => {
  delete process.env.NEXUS_BASE_URL;
  delete process.env.NEXUS_DASHBOARD_URL;
  delete process.env.NEXUS_PROFILE;
  delete process.env.NEXUS_ENV;
});

afterAll(() => {
  delete process.env.NEXUS_ENV;
});

describe("NEXUS_ENV picks an environment, and an unknown name picks none", () => {
  it("has a sandbox HOME with no profile store, so the env term is reachable", () => {
    // Anti-vacuity for every arm below. With a real config on the path, the
    // profile term answers first and nothing here is exercising the map at all.
    expect(SANDBOX).toContain("nexus-env-map-");
    expect(process.env.HOME).toBe(SANDBOX);
  });

  it("sends `staging` to the staging API host", () => {
    process.env.NEXUS_ENV = "staging";
    expect(resolveBaseUrl()).toBe(EXPECTED.staging.api);
  });

  it("sends `staging` to the staging console host", () => {
    process.env.NEXUS_ENV = "staging";
    expect(resolveDashboardUrl()).toBe(EXPECTED.staging.dashboard);
  });

  it("keeps an UNSET variable on production — the default was never the defect", () => {
    // The positive half of the negative arm below: this is the only input for
    // which the production hosts are the right answer, so it proves the
    // resolvers CAN return them and the absences below are findings.
    expect.soft(answerOf(resolveBaseUrl)).toBe(PRODUCTION_API);
    expect.soft(answerOf(resolveDashboardUrl)).toBe(PRODUCTION_DASHBOARD);
  });

  it("never answers a production host for an environment that is not production", () => {
    // 🔴 THE DEFECT, STATED DIRECTLY. `staging` and `dev` both resolved to the
    // production pair before this change. `expect.soft` so BOTH names are
    // scored: a hard assertion on the first one throws and the second would
    // never run, and the report would credit the kill to `dev` alone.
    for (const name of ["staging", "dev"]) {
      process.env.NEXUS_ENV = name;
      expect.soft(answerOf(resolveBaseUrl), `base URL for ${name}`).not.toBe(PRODUCTION_API);
      expect
        .soft(answerOf(resolveDashboardUrl), `dashboard for ${name}`)
        .not.toBe(PRODUCTION_DASHBOARD);
    }
  });

  it("resolves every accepted name to its own pair of hosts", () => {
    for (const [name, hosts] of Object.entries(EXPECTED)) {
      process.env.NEXUS_ENV = name;
      expect.soft(answerOf(resolveBaseUrl), `base URL for ${name}`).toBe(hosts.api);
      expect.soft(answerOf(resolveDashboardUrl), `dashboard for ${name}`).toBe(hosts.dashboard);
    }
  });

  it("REFUSES an unknown name from the base-URL resolver instead of resolving it", () => {
    process.env.NEXUS_ENV = "banana";
    expect(() => resolveBaseUrl()).toThrow(CategorizedCliError);
  });

  it("REFUSES an unknown name from the dashboard resolver too", () => {
    // The two resolvers read one table, so a fix applied to one of them is half
    // a fix: a command can send its request to a refused environment and still
    // print a console link for a different one.
    process.env.NEXUS_ENV = "banana";
    expect(() => resolveDashboardUrl()).toThrow(CategorizedCliError);
  });

  it("names the offending value and the accepted set, and exits non-zero", () => {
    process.env.NEXUS_ENV = "Production";
    let thrown: unknown;
    try {
      resolveBaseUrl();
    } catch (error) {
      thrown = error;
    }

    // A message that says only "invalid environment" leaves the operator
    // guessing which of several exported variables is the one at fault.
    if (!(thrown instanceof CategorizedCliError)) {
      throw new Error(`expected a CategorizedCliError, got: ${String(thrown)}`);
    }
    expect.soft(thrown.message).toContain("Production");
    expect.soft(thrown.message).toContain("NEXUS_ENV");
    expect.soft(thrown.message).toContain("staging");
    expect.soft(thrown.category).toBe("invalid-input");
    expect.soft(thrown.exitCode).not.toBe(0);
    // ⚠️ `config.ts` SPELLS THIS LITERALLY to dodge a module cycle through
    // `output.ts`, so the literal and the `CLI_CODES` row in `errors.ts` can
    // diverge in silence. This arm is the only thing holding them together.
    expect.soft(thrown.code).toBe("CLI_UNKNOWN_NEXUS_ENV");
  });

  it("still lets an explicit host win over an unknown name, without refusing", () => {
    // The refusal is the LAST term of the chain, so it must not fire when
    // something earlier already answered. A refusal that outranked
    // `--base-url` would break every caller that pins a host deliberately.
    process.env.NEXUS_ENV = "banana";
    expect(resolveBaseUrl("http://127.0.0.1:19999")).toBe("http://127.0.0.1:19999");
  });

  it("still lets NEXUS_BASE_URL win over an unknown name", () => {
    process.env.NEXUS_ENV = "banana";
    process.env.NEXUS_BASE_URL = "http://127.0.0.1:19998";
    expect(resolveBaseUrl()).toBe("http://127.0.0.1:19998");
  });

  it("treats an EMPTY value as unset — that is what CI templating writes", () => {
    // `NEXUS_ENV: ${{ vars.NEXUS_ENV }}` over a variable that does not exist,
    // `NEXUS_ENV=$UNSET`, `export NEXUS_ENV=` — all produce `""`, and `??`
    // defaults on `undefined`/`null` only. Refusing here breaks a caller who
    // never chose anything, which is the opposite of this refusal's point.
    process.env.NEXUS_ENV = "";
    expect.soft(answerOf(resolveBaseUrl)).toBe(PRODUCTION_API);
    expect.soft(answerOf(resolveDashboardUrl)).toBe(PRODUCTION_DASHBOARD);
  });

  it("treats a WHITESPACE-ONLY value as unset, for the same reason", () => {
    process.env.NEXUS_ENV = "   ";
    expect.soft(answerOf(resolveBaseUrl)).toBe(PRODUCTION_API);
    expect.soft(answerOf(resolveDashboardUrl)).toBe(PRODUCTION_DASHBOARD);
  });

  it("trims a name rather than refusing it — a stray space has the same origin", () => {
    process.env.NEXUS_ENV = " staging ";
    expect(answerOf(resolveBaseUrl)).toBe(EXPECTED.staging.api);
  });

  it("stays CASE-SENSITIVE — a name nobody serves must not reach production", () => {
    // The positive half is every arm above: lowercase `staging` resolves. So
    // this refusal is about the CASE and not about `staging` being unknown.
    process.env.NEXUS_ENV = "STAGING";
    expect(() => resolveBaseUrl()).toThrow(CategorizedCliError);
  });

  it("SHOWS THE ASYMMETRY the startup check exists to close", () => {
    // 🔴 THE TWO RESOLVERS DISAGREE, AND THIS IS THE CONFIGURATION IN WHICH
    // THEY CAN. `NEXUS_BASE_URL` settles the API host before the environment
    // name is ever consulted; nothing settles the console host, so the second
    // resolver falls through and refuses. A command that writes first and
    // builds its link second therefore mutates and THEN exits non-zero.
    //
    // `nexus-env-refuses-before-any-write.test.ts` is the arm that proves the
    // write no longer happens. This one pins WHY that arm has to exist — the
    // disagreement is a property of the two chains, not of any one flag.
    process.env.NEXUS_ENV = "banana";
    process.env.NEXUS_BASE_URL = "http://127.0.0.1:19997";

    expect.soft(answerOf(resolveBaseUrl)).toBe("http://127.0.0.1:19997");
    expect.soft(answerOf(resolveDashboardUrl)).toBeInstanceOf(CategorizedCliError);
  });
});
