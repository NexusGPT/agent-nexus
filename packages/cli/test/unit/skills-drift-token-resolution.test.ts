import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `resolveToken()` — the credential half of the skills-drift check.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS: THE PROBE THAT WAS SUPPOSED TO COVER THIS COULD NOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The mission's own verification for the CANNOT_CHECK state was a shell probe:
 * unset all three credential names and confirm the checker reports NO_TOKEN.
 *
 *     env -u SKILLS_NEXUS_READ_TOKEN -u GITHUB_TOKEN -u GH_TOKEN <the check>
 *
 * Measured 2026-09-08: that exits **0**, and it always would have. `gh` is
 * authenticated on this machine, so the fourth resolution step — `gh auth token`
 * — answers, the read is performed with a REAL credential, and the run never
 * enters the no-token path at all. The tell that settled it was an
 * unauthenticated `curl` against the same private repository returning **404**
 * where the "anonymous" run had returned data: the read was never anonymous.
 *
 * 🔴 `env -u` UNSETS AN ENVIRONMENT VARIABLE. IT DOES NOT REMOVE A CREDENTIAL.
 *    A probe over a resolver with a shell-out fallback measures the machine it
 *    runs on, and on a developer machine the reassuring answer is the one it
 *    cannot help giving.
 *
 * So the arms below drive `resolveToken()` with `execSync` under control, which
 * is the only way to say what the resolver does when there is genuinely nothing
 * to find — and, just as importantly, to pin the `GITHUB_ACTIONS` refusal, which
 * no local shell probe can reach without lying about where it is running.
 */
const { execSync } = vi.hoisted(() => ({ execSync: vi.fn() }));

vi.mock("node:child_process", () => ({ execSync }));

import { resolveToken } from "../../scripts/skills-drift/upstream";

const NAMED = "SKILLS_NEXUS_READ_TOKEN";
const AMBIENT = "GITHUB_TOKEN";
const LEGACY = "GH_TOKEN";

/** Coined, so a hit on one of these cannot have come from a real credential. */
const NAMED_VALUE = "sentinel-named-token";
const AMBIENT_VALUE = "sentinel-ambient-token";
const LEGACY_VALUE = "sentinel-legacy-token";
const GH_CLI_VALUE = "sentinel-gh-cli-token";

/** `gh auth token` answers, exactly as it does on any authed developer machine. */
function ghIsAuthenticated(): void {
  execSync.mockReturnValue(`${GH_CLI_VALUE}\n`);
}

/** `gh` is absent, or present and logged out — both throw out of `execSync`. */
function ghIsUnavailable(): void {
  execSync.mockImplementation(() => {
    throw new Error("gh: command not found");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // `vi.stubEnv(name, undefined)` DELETES the variable; assigning a saved
  // `undefined` back would store the string "undefined" and every check below
  // would read a non-empty credential.
  for (const name of [NAMED, AMBIENT, LEGACY, "GITHUB_ACTIONS"]) {
    vi.stubEnv(name, undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveToken — the control that exposed the broken probe", () => {
  it("hands back the `gh auth token` value when all three names are unset", () => {
    // 🚨 THIS IS THE ARM THAT MAKES THE `env -u` PROBE WORTHLESS, and it is
    // asserted rather than merely narrated: with no environment credential at
    // all, an authenticated `gh` still yields one. Any probe that unsets the
    // three names on a developer machine is measuring THIS branch, not the
    // no-credential branch it believes it is measuring.
    ghIsAuthenticated();

    expect(resolveToken()).toBe(GH_CLI_VALUE);
    expect(execSync).toHaveBeenCalledTimes(1);
    expect(String(execSync.mock.calls[0]?.[0])).toContain("gh auth token");
  });
});

describe("resolveToken — the no-credential path, which no shell probe can reach", () => {
  it("returns null when nothing answers", () => {
    ghIsUnavailable();
    expect(resolveToken()).toBeNull();
  });

  it("returns null when `gh` answers with an empty string", () => {
    // A logged-out `gh` on some versions exits 0 and prints nothing. Returning
    // "" would be a credential the reader sends as `Bearer `, earning a 401 the
    // verdict maps to a DIFFERENT state than NO_TOKEN.
    execSync.mockReturnValue("   \n");
    expect(resolveToken()).toBeNull();
  });

  it("REFUSES the `gh` fallback on a runner, even when gh would answer", () => {
    // The whole point of the refusal: on Actions the only credential that
    // belongs here is the purpose-named secret. A repo-scoped `gh` token would
    // earn a 404 from the private source and report UPSTREAM_NOT_FOUND —
    // sending a reader hunting a mis-scoped token that was never configured.
    ghIsAuthenticated();
    vi.stubEnv("GITHUB_ACTIONS", "true");

    expect(resolveToken()).toBeNull();
    expect(execSync).not.toHaveBeenCalled();
  });

  it("still uses the named secret on a runner — the refusal is scoped to `gh`", () => {
    // CONTROL for the arm above. Without it, a resolver that returned null for
    // EVERYTHING on a runner would satisfy it perfectly.
    ghIsAuthenticated();
    vi.stubEnv("GITHUB_ACTIONS", "true");
    vi.stubEnv(NAMED, NAMED_VALUE);

    expect(resolveToken()).toBe(NAMED_VALUE);
  });
});

describe("resolveToken — precedence and blankness", () => {
  it("prefers the purpose-named secret over both ambient names", () => {
    ghIsAuthenticated();
    vi.stubEnv(NAMED, NAMED_VALUE);
    vi.stubEnv(AMBIENT, AMBIENT_VALUE);
    vi.stubEnv(LEGACY, LEGACY_VALUE);

    expect(resolveToken()).toBe(NAMED_VALUE);
    expect(execSync).not.toHaveBeenCalled();
  });

  it("prefers GITHUB_TOKEN over GH_TOKEN", () => {
    ghIsAuthenticated();
    vi.stubEnv(AMBIENT, AMBIENT_VALUE);
    vi.stubEnv(LEGACY, LEGACY_VALUE);

    expect(resolveToken()).toBe(AMBIENT_VALUE);
  });

  it("falls through an EMPTY value at every level rather than sending `Bearer `", () => {
    // A cleared secret in a workflow arrives as "", not as absent. Treating it
    // as present sends an empty bearer, which is a 401 — a different state, a
    // different remedy, and the one nobody would look for.
    ghIsUnavailable();
    vi.stubEnv(NAMED, "");
    vi.stubEnv(AMBIENT, "");
    vi.stubEnv(LEGACY, "");

    expect(resolveToken()).toBeNull();
  });

  it("falls through an empty NAMED secret to the ambient one", () => {
    ghIsAuthenticated();
    vi.stubEnv(NAMED, "");
    vi.stubEnv(AMBIENT, AMBIENT_VALUE);

    expect(resolveToken()).toBe(AMBIENT_VALUE);
  });
});
