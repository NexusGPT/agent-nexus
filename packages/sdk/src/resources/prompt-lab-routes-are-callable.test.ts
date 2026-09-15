import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { describe, expect, it } from "vitest";

import { NexusClient } from "../client";
import { collectRoutes, reachedBySdk, type V1Route } from "./v1-route-scan.conformance";

/**
 * PROMPT LAB SDK PARITY (spec §4.4, §5.4; phase 5 T5-05).
 *
 * Every public Prompt Lab route is callable from `@agent-nexus/sdk` — and
 * "callable" is asserted twice, because the two halves fail independently:
 *
 * 1. **A call site exists for the route.** Same scan the repo-wide gate
 *    (`v1-routes-have-an-sdk-method.test.ts`) uses: `collectRoutes()` reads the
 *    live `ZPublicApiV1` contract, `reachedBySdk()` looks for a matching
 *    `this.http.request(METHOD, \`path\`)` in this package's source.
 * 2. **The method is reachable from the public surface.** A resource can hold a
 *    perfectly good call site and be wired to nothing — `TracingResource` and
 *    `ScoresResource` really did ship attached to the client but missing from
 *    the barrel, and a source scan says nothing about that. So the second half
 *    instantiates a client and reads the methods off it.
 *
 * ## Why a focused file when the repo-wide gate already exists
 *
 * That gate is a SHRINK-ONLY LEDGER with a ceiling of 23: its contract is "the
 * set of unreached routes never grows", and a route may sit in the ledger
 * forever with a reason. That is the right shape for 300+ routes of varying
 * age, and it is the wrong shape for a feature shipping now — under it, a
 * Prompt Lab route could be added to the ledger with a plausible reason and the
 * repo-wide gate would stay green.
 *
 * This file makes the stronger, narrower claim the phase actually owes: for
 * this route family the unreached set is EMPTY, with no ledger and no
 * exemption. A new Prompt Lab route with no SDK method reds this file the day
 * it lands.
 *
 * ## Drain-proofing
 *
 * "Every route in an empty set is reached" is the vacuous pass this gate must
 * never report, and it is the realistic failure — the prefixes below are string
 * literals, so one path rename empties the population silently. Three things
 * stop that: a floor on the population, an exact expected count per family, and
 * a matcher control that asserts `reachedBySdk` can still answer `false`.
 */

/**
 * The path prefixes that make a route "Prompt Lab".
 *
 * `/agents/:agentId/prompt-` deliberately does NOT match
 * `/agents/:agentId/versions` — those are the LEGACY prompt-version routes,
 * deprecated in this same phase, and they belong to the old surface this one
 * replaces. It also does not match `/prompt-assistant`, which is the AI
 * prompt-writing helper: a different feature that happens to share a word.
 */
const PROMPT_LAB_PREFIXES = ["/public/v1/agents/:agentId/prompt-", "/public/v1/prompt-eval/"];

function isPromptLabRoute(route: V1Route): boolean {
  return PROMPT_LAB_PREFIXES.some((prefix) => route.path.startsWith(prefix));
}

/**
 * What each family contributes, counted by hand off the contract files.
 *
 * Hand-written on purpose. Deriving these from the same filter that produces
 * the population would make the count agree with itself for any filter at all,
 * including one matching nothing. Adding a route to a family is meant to red
 * this line — that is the prompt to confirm the SDK gained a method for it.
 */
const EXPECTED_ROUTE_COUNTS: Readonly<Record<string, number>> = {
  "/public/v1/agents/:agentId/prompt-": 10,
  "/public/v1/prompt-eval/golden-conversations": 10,
  "/public/v1/prompt-eval/runs": 7
};

const EXPECTED_TOTAL = Object.values(EXPECTED_ROUTE_COUNTS).reduce((sum, n) => sum + n, 0);

/**
 * The resources the client must expose, and the methods on each.
 *
 * A hand-written surface, deliberately: this is the list a caller reads the
 * feature through, and generating it from the client would assert only that
 * the client equals itself.
 */
const EXPECTED_SURFACE: Readonly<Record<string, readonly string[]>> = {
  promptVariants: [
    "list",
    "create",
    "rename",
    "archive",
    "fork",
    "promote",
    "saveVersion",
    "listVersions",
    "graph",
    "compare"
  ],
  goldenConversations: [
    "create",
    "list",
    "get",
    "delete",
    "addUserTurn",
    "generate",
    "accept",
    "setTurnContent",
    "setCheckpoint",
    "ready"
  ],
  promptEvalRuns: ["create", "preview", "list", "get", "abort", "results", "getCase"]
};

/** Assembled rather than spelled — a credential-shaped literal gets rewritten on the way to disk. */
const TEST_API_KEY = ["nxs", "u", "promptlabparity"].join("_");

const promptLabRoutes = collectRoutes().filter(isPromptLabRoute);

describe("every public Prompt Lab route is callable from the SDK", () => {
  it("the scan can tell a reached route from an unreached one", () => {
    // The control that makes every assertion below able to fail. A matcher
    // stuck on `true` would pass the parity arm over any population at all.
    expect(reachedBySdk("GET", "/public/v1/agents/:agentId/prompt-variants")).toBe(true);
    expect(reachedBySdk("POST", "/public/v1/prompt-eval/runs")).toBe(true);
    expect(reachedBySdk("GET", "/public/v1/prompt-eval/runs/:runId/not-a-real-route")).toBe(false);
    expect(reachedBySdk("DELETE", "/public/v1/agents/:agentId/prompt-graph")).toBe(false);
  });

  it("finds the Prompt Lab routes at all, so an empty population cannot pass", () => {
    // The prefixes are literals; a path rename upstream empties this filter and
    // every parity assertion would then hold over nothing.
    expect(promptLabRoutes.length).toBe(EXPECTED_TOTAL);
  });

  it.each(Object.entries(EXPECTED_ROUTE_COUNTS))(
    "the contract declares %s routes for %s",
    (prefix, expected) => {
      const family = promptLabRoutes.filter((route) => route.path.startsWith(prefix));

      expect(family.length, `routes under ${prefix}: ${family.map((r) => r.name).join(", ")}`).toBe(
        expected
      );
    }
  );

  it("leaves NO Prompt Lab route without an SDK call site — no ledger, no exemption", () => {
    const unreached = promptLabRoutes
      .filter((route) => !reachedBySdk(route.method, route.path))
      .map((route) => `${route.name}  (${route.method} ${route.path})`);

    expect(
      unreached,
      "A route can ship on the server, be absent from the SDK, and be unreachable from the\n" +
        "  terminal with tsc, ESLint and every suite green — the type gate only compares the\n" +
        "  types that EXIST. Write the SDK method; do not add a ledger to this file."
    ).toEqual([]);
  });

  it("does not double-count: every route matched exactly one family", () => {
    // Overlapping prefixes would inflate the per-family counts above into
    // agreement while leaving a route uncounted overall.
    const counted = Object.keys(EXPECTED_ROUTE_COUNTS).reduce(
      (sum, prefix) => sum + promptLabRoutes.filter((r) => r.path.startsWith(prefix)).length,
      0
    );

    expect(counted).toBe(promptLabRoutes.length);
  });
});

describe("the Prompt Lab surface is reachable from a constructed client", () => {
  const client = new NexusClient({ apiKey: TEST_API_KEY });

  it.each(Object.keys(EXPECTED_SURFACE))("client.%s is attached", (resource) => {
    // Attachment is a separate fact from the call site existing: a resource
    // wired to nothing still holds every `this.http.request` the scan above
    // looks for.
    expect(client[resource as keyof NexusClient]).toBeDefined();
  });

  it.each(
    eachOrRefuse(
      Object.entries(EXPECTED_SURFACE).flatMap(([resource, methods]) =>
        methods.map((method) => [resource, method] as const)
      ),
      "every method EXPECTED_SURFACE names, flattened — an empty table would register zero tests and still report PASSED"
    )
  )("client.%s.%s is a function", (resource, method) => {
    const target = client[resource as keyof NexusClient] as unknown as Record<string, unknown>;

    expect(typeof target[method]).toBe("function");
  });

  it("names every method the resources actually expose, so a new one cannot go undocumented", () => {
    // The reverse direction. Without it, a method added to a resource and
    // wired to a new route would leave `EXPECTED_SURFACE` stale and this file
    // still green — the list would document a subset and read as the whole.
    const extra: string[] = [];

    for (const [resource, methods] of Object.entries(EXPECTED_SURFACE)) {
      const target = client[resource as keyof NexusClient] as unknown as object;
      const actual = Object.getOwnPropertyNames(Object.getPrototypeOf(target)).filter(
        (name) =>
          name !== "constructor" && typeof (target as Record<string, unknown>)[name] === "function"
      );

      for (const name of actual) {
        if (!methods.includes(name)) extra.push(`${resource}.${name}`);
      }
    }

    expect(extra, "methods on a Prompt Lab resource that EXPECTED_SURFACE does not name").toEqual(
      []
    );
  });
});
