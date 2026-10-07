/**
 * THE ROUTE-ABSENCE MATCHER ACCEPTS ONE DECLARED PATH, AND NOTHING THAT MERELY
 * RESEMBLES IT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS PROTECTS, AND WHY IT IS A SEPARATE FILE FROM THE SWEEP'S ARMS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `scripts/route-not-deployed.sh` decides whether the refusal in front of a leaf
 * is THE PATH THAT LEAF IS DECLARED FOR being absent from the deployed API.
 * `sweep-routes-pending-deploy-self-retire.test.ts` proves the sweep is WIRED to
 * that answer and acts on it correctly — it runs the real script end to end, six
 * times, which is seconds of real work per case.
 *
 * This file proves the answer itself, and it costs milliseconds. The two tiers
 * discriminate different mutants and neither covers the other: an arm that
 * exercises the matcher through a whole sweep can only reach the shapes a stub
 * can produce for one leaf at a time, while the sentence has several near-misses
 * that have to be scored side by side to mean anything.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 IT SOURCES THE SHIPPING FILE AND CALLS THE SHIPPING FUNCTION
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Not a TypeScript re-implementation of the regex, and not a copy of the pattern
 * read out and executed here. A spec that exercises a LOCAL REPLICA of its
 * subject is honest, runs, reaches its branch, and holds no claim whatever about
 * the real thing — and a replica drifts in silence in both directions: it keeps
 * asserting a shape the subject has stopped having, and it keeps passing a shape
 * the subject has started accepting.
 *
 * So every case below shells out to `bash`, sources the file `sweep.sh` sources,
 * and reads the exit code of `is_route_not_deployed`. The subject is the artifact.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THREE EXIT CODES, AND 2 IS NOT 1
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   0  the refusal IS this exact path being absent
 *   1  it is not — the caller scores the failure on its own merits
 *   2  REFUSED: the declared path is not a literal path, so nothing was measured
 *
 * Collapsing 2 into 1 would turn a typo in a declaration into a leaf that fails
 * for a reason nobody can read. Collapsing it into 0 would splice an
 * unvalidated string into a regular expression — a declaration reading `.*`
 * accepting every 404 there is, which is the broadening the whole mechanism
 * exists to refuse.
 *
 * ⚠️ WHAT THIS CANNOT DO. The `Cannot <VERB> <path>` half of the sentence is an
 * English sentence owned by `apps/backend`, and `packages/cli` is mirrored to a
 * public repository on its own, so nothing here may reach across to assert it. It
 * was measured 2026-10-07 against the deployed staging API — `GET
 * /api/public/v1/mcp-servers` answering 404 with that body, a never-registered
 * control path answering the same shape, and two live paths answering 401 instead
 * — and a reword re-reds the gate silently. The coupling is documented, not
 * enforced, exactly as `policy-refusal.sh` says of its own phrases.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SWEEP_ROUTES_PENDING_DEPLOY } from "./command-universe";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MATCHER = join(PACKAGE_ROOT, "scripts", "route-not-deployed.sh");

/**
 * `is_route_not_deployed`'s own exit code, out of the shipping file.
 *
 * `bash -c <script> <name> <args…>` binds `$1`/`$2`/`$3` with no quoting games
 * and no interpolation of a transcript into a script body — a transcript carries
 * JSON, quotes and the odd em dash, and splicing one into source would make this
 * harness the thing under test.
 *
 * `spawnSync` is correct HERE and wrong in the end-to-end file: each call is
 * milliseconds, so the event loop is never held anywhere near vitest's birpc
 * ceiling. That file carries the measurement and spawns asynchronously.
 */
function classify(transcript: string, route: string): number {
  const result = spawnSync(
    "bash",
    [
      "-c",
      '. "$1" || exit 99; is_route_not_deployed "$2" "$3"',
      "matcher-harness",
      MATCHER,
      transcript,
      route
    ],
    { encoding: "utf8" }
  );
  if (result.error !== undefined) throw result.error;
  // 99 is the harness's own refusal and can never be the matcher's verdict: a
  // file that failed to source would otherwise leave every function undefined
  // and every call non-zero, which reads exactly like "not a route absence".
  if (result.status === 99) {
    throw new Error(`could not source ${MATCHER}: ${result.stderr}`);
  }
  return result.status ?? -1;
}

/** The shape `printCliError` emits under `--json` — see `src/errors.ts`. */
function cliError(message: string, code: string): string {
  return JSON.stringify({ error: { message, hint: null, code } }, null, 2);
}

/**
 * The CLI's own 404 rendering: `Not found: ` + whatever the API said. The prefix
 * is this package's (`src/errors.ts`), the rest is the deployed API's.
 */
function routeAbsence(path: string, verb = "GET"): string {
  return cliError(`Not found: Cannot ${verb} ${path}`, "NOT_FOUND");
}

/**
 * The path this repository has actually declared, read out of the declaration
 * rather than typed. A literal here would keep passing after the declaration
 * moved, which is the drift this whole family of specs is about.
 */
const DECLARED_PATHS = Object.values(SWEEP_ROUTES_PENDING_DEPLOY).map(({ route }) => route);
const ROUTE = DECLARED_PATHS[0] ?? "";

describe("the route-absence matcher accepts one declared path", () => {
  it("reads a declared path out of the declaration", () => {
    // A vacuity control ahead of every case below: with no declaration, `ROUTE`
    // is empty, and an empty route is the UNDECLARED case — so every assertion
    // would be true of nothing while reading as a check on something.
    expect(DECLARED_PATHS.length).toBeGreaterThan(0);
    expect(ROUTE).not.toBe("");
  });

  // ── The one that must be ACCEPTED ─────────────────────────────────────────

  it("ACCEPTS the declared path being absent", () => {
    expect(classify(routeAbsence(ROUTE), ROUTE)).toBe(0);
  });

  it("ACCEPTS it under any verb — the PATH is the discriminator, not the verb", () => {
    // A route deployed for POST and absent for GET is pending-deploy either way,
    // so pinning the verb would add a second field to keep in step with the
    // declaration while excluding nothing the path does not already exclude.
    expect(classify(routeAbsence(ROUTE, "POST"), ROUTE)).toBe(0);
    expect(classify(routeAbsence(ROUTE, "DELETE"), ROUTE)).toBe(0);
  });

  // ── The ones that must be REFUSED ─────────────────────────────────────────

  it("REFUSES a 404 naming a SIBLING path", () => {
    // 🔴 THE LOAD-BEARING ONE. Same sentence, same status, same exit code — the
    // path is the only difference. A matcher keyed on `Cannot GET` alone turns a
    // CLI that calls the wrong route green, and that 404 is otherwise
    // indistinguishable from this one.
    expect(classify(routeAbsence("/api/public/v1/some-other-collection"), ROUTE)).toBe(1);
  });

  it("REFUSES a 404 whose path merely STARTS WITH the declared one", () => {
    // 🔴 THE ANCHOR ARM. `…/mcp-servers-typo` contains `…/mcp-servers`, so an
    // unanchored matcher accepts it — and a trailing-character typo is exactly
    // the shape a real route defect takes. The closing quote in the pattern is
    // what makes the bind exact rather than a prefix.
    expect(classify(routeAbsence(`${ROUTE}-not-this-one`), ROUTE)).toBe(1);
  });

  it("REFUSES a 404 whose path is a PREFIX of the declared one", () => {
    // The other direction, and it needs its own case: a matcher that compared
    // the other way round would accept this and refuse the one above.
    expect(classify(routeAbsence(ROUTE.slice(0, -1)), ROUTE)).toBe(1);
  });

  it("REFUSES a 404 that is a RESOURCE refusal from a route that IS deployed", () => {
    // The commonest real failure a read-only sweep can surface, and it shares
    // the status, the exit code AND the CLI's `Not found: ` prefix with the
    // accepted case. Only `Cannot <VERB> <path>` separates them.
    expect(classify(cliError("Not found: Agent not found", "NOT_FOUND"), ROUTE)).toBe(1);
  });

  it("REFUSES a 500 even when its message ECHOES the declared path", () => {
    // 🔴 THE ARM THAT PINS THE SENTENCE RATHER THAN THE PATH. A matcher narrowed
    // to the path alone — dropping `Not found: Cannot <VERB> ` as redundant —
    // accepts this, and an outage on the one declared leaf then reads as a route
    // nobody has deployed. An error echoing the request path is ordinary.
    expect(
      classify(cliError(`API error (500): upstream failed for ${ROUTE}`, "INTERNAL"), ROUTE)
    ).toBe(1);
  });

  it("REFUSES a 401 — a broken CI key must never read as an undeployed route", () => {
    // The most expensive false acceptance available: an expired key refuses every
    // leaf at once.
    expect(
      classify(
        cliError("Authentication failed — invalid or missing API key.", "UNAUTHENTICATED"),
        ROUTE
      )
    ).toBe(1);
  });

  it("REFUSES the policy opt-out sentence — the two matchers do not overlap", () => {
    // `policy-refusal.sh` owns that sentence and `sweep.sh` asks it FIRST. If
    // this one also accepted it, the ordering would stop mattering and a leaf
    // that is merely opted out would be reported as an undeployed route.
    expect(
      classify(
        cliError(
          "API error (403): This organization has opted out of this feature",
          "FEATURE_NOT_ENABLED"
        ),
        ROUTE
      )
    ).toBe(1);
  });

  it("REFUSES a non-JSON failure such as an unknown subcommand", () => {
    // A commander error is plain text with no `"message":` field at all, so it
    // cannot reach the matcher however wide the sentence gets.
    expect(classify("error: unknown command 'lsit'", ROUTE)).toBe(1);
  });

  it("REFUSES everything when the leaf carries NO declaration", () => {
    // The ordinary case — most leaves are undeclared — and it must be a clean
    // "no" rather than a refusal, because the caller asks this of every leaf.
    expect(classify(routeAbsence(ROUTE), "")).toBe(1);
  });

  // ── The declaration itself ────────────────────────────────────────────────

  it("REFUSES WITH 2, never 1, when the declared path is not a literal path", () => {
    // 🔴 NOTHING WAS MEASURED, AND THAT IS A THIRD ANSWER. `.*` is the shape that
    // would accept every 404 in the sweep; a status that read as "no match" would
    // leave a typo'd declaration looking like a leaf failing for its own reasons.
    for (const malformed of [".*", "/api/.*", "api/public/v1/x", "/api/x y", "/api/x|y"]) {
      expect(classify(routeAbsence(ROUTE), malformed), `${malformed} was not refused`).toBe(2);
    }
  });

  it("treats a DOT in a declared path as a literal, not as a wildcard", () => {
    // `.` is the one character the charset allows that is also a regex
    // metacharacter, so it is escaped rather than excluded — refusing a path with
    // a version segment in it would be a gate refusing correct work. Both
    // directions, because escaping it and dropping it from the charset look the
    // same from the accepting side alone.
    expect(classify(routeAbsence("/api/v1.1/thing"), "/api/v1.1/thing")).toBe(0);
    expect(classify(routeAbsence("/api/v1X1/thing"), "/api/v1.1/thing")).toBe(1);
  });
});
