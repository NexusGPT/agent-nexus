import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { describe, expect, it } from "vitest";

import { collectionPrefix, deriveIdGraph, pluralsFor, residues, routeParams } from "./id-graph";
import { idsFrom } from "./id-graph.ids";
import { LEAF_RESIDUE } from "./id-graph.leaf-residue";
import { RESIDUE } from "./id-graph.residue";
import { walkLeaves } from "./id-graph.walk";

/**
 * THE COVERAGE GATE FOR THE ID-THREADING HARNESS.
 *
 * ==============================================================================
 * HOW THE HARNESS KNOWS ITS OWN DENOMINATOR
 * ==============================================================================
 *
 * A harness whose population is a list somebody maintains decays in silence: a
 * leaf lands, nothing covers it, nothing says so, and six months later the whole
 * thing has to be redone. That is the defect `command-universe.ts` deleted for
 * `sweep.sh`, and this file applies the same shape one level up.
 *
 * The population here is DERIVED on every run - `deriveIdGraph()` walks the live
 * commander tree - so a new leaf is in the denominator the moment it is
 * registered. What this file adds is the refusal:
 *
 *   - every param that no rule can resolve MUST be declared in `RESIDUE` with a
 *     reason, or this suite goes red. A new unreachable leaf cannot land quietly.
 *   - every `RESIDUE` row must still describe a real, still-unresolved param, so
 *     a row that has silently started resolving is reported as stale rather than
 *     kept forever.
 *   - no leaf that MUTATES may ever appear in the population.
 *
 * The gate does NOT assert a coverage count. A pinned number would go red on
 * every unrelated command anyone adds and would be tuned down within a week; the
 * assertion that carries weight is that nothing is unaccounted for.
 */

const graph = deriveIdGraph();
// Hoisted: each call rebuilds the entire commander tree, and this suite reads it
// from several describes.
const leaves = walkLeaves();

describe("the derived population", () => {
  it("covers the whole tree, so the denominator is not a subset", () => {
    expect(graph.totalLeaves).toBe(leaves.length);
    expect(graph.totalLeaves).toBeGreaterThan(400);
  });

  it("accounts for every leaf that needs an id, with nothing falling between the buckets", () => {
    expect(graph.threadable.length + graph.excluded.length).toBe(graph.needsAnId);
  });

  it("is not empty, which is the shape a broken derivation takes", () => {
    expect(graph.executable.length).toBeGreaterThan(0);
  });
});

describe("no write can enter the population", () => {
  /**
   * The load-bearing assertion of the whole harness. Every executable leaf is a
   * proven `GET`, and the proof is the contract binding rather than the verb in
   * its name.
   */
  it.each(eachOrRefuse(graph.threadable, "every leaf the id graph will execute"))(
    "$path is a proven GET",
    (leaf) => {
      expect(leaf.method).toBe("GET");
    }
  );

  /**
   * ⚠️ NO `expect(excluded.length).toBeGreaterThan(0)` ANYWHERE BELOW, and its
   * absence is deliberate. Every exclusion bucket here is DEBT: the 238 unbound
   * leaves drain as `bindCommand` calls land, and that is the outcome this whole
   * harness is meant to drive toward. A floor on them is a control that dies on
   * success — it reds the build for whoever finishes the cleanup, and the gate
   * gets deleted rather than celebrated.
   *
   * The anti-vacuity control instead sits on {@link IdGraph.needsAnId}, which
   * SURVIVES the cure: a leaf that becomes reachable is still a leaf that takes
   * an id, so no amount of fixing can empty it.
   */
  it("has a population to reason about at all", () => {
    expect(graph.needsAnId).toBeGreaterThan(0);
  });

  it("gives every bound mutation it excludes a non-GET method", () => {
    const offenders = graph.excluded
      .filter((leaf) => leaf.why === "bound-but-mutates")
      .filter((leaf) => leaf.method === undefined || leaf.method === "GET")
      .map((leaf) => `${leaf.path} -> ${String(leaf.method)}`);

    expect(offenders, "`bound-but-mutates` must name the method that disqualified it.").toEqual([]);
  });

  it("records no method for a leaf it excluded as unbound", () => {
    const offenders = graph.excluded
      .filter((leaf) => leaf.why === "unbound-no-provable-method")
      .filter((leaf) => leaf.method !== undefined)
      .map((leaf) => `${leaf.path} -> ${String(leaf.method)}`);

    expect(
      offenders,
      "An unbound leaf has no provable method; recording one is a contradiction."
    ).toEqual([]);
  });
});

describe("every unresolved param is declared", () => {
  /**
   * THE GATE. An undeclared residue carries an empty `because`, which is what
   * this refuses on - see `id-graph.ts`, which never drops one silently.
   */
  it("has no residue without a stated reason", () => {
    const undeclared = residues(graph).filter((entry) => entry.source.because === "");
    expect(
      undeclared.map((entry) => `${entry.leaf} :${entry.source.param}`),
      "A param no rule can resolve must be declared in id-graph.residue.ts with a reason. " +
        "Deleting the leaf or demoting it is never the fix."
    ).toEqual([]);
  });

  /**
   * 🚨 ONE `it` COLLECTING OFFENDERS, NEVER `.each` OVER `RESIDUE`.
   *
   * `RESIDUE` is a DECLARED DEBT LEDGER and its EMPTY state is the SUCCESS
   * state: draining it means every param found a producer. `.each` over it — in
   * any spelling, `eachOrRefuse` included — dies at COLLECTION the day it
   * reaches zero, taking every sibling check in the describe with it. So the
   * gate would refuse the very outcome it exists to drive toward.
   *
   * ⚠️ THIS IS THE OPPOSITE CALL FROM THE `.each` OVER `graph.threadable` ABOVE,
   * and the distinction is the population, not the wrapper. That one is DERIVED
   * from the command tree, so an empty table means a selector broke and
   * `eachOrRefuse` is exactly right. This one is DECLARED, so an empty table
   * means somebody did the work.
   *
   * There is also NO STALENESS ARM here any more. "A row whose param now
   * resolves must be deleted" is a lower bound on draining data: it reds the
   * build on the act of fixing a param, until the row goes in the same edit.
   */
  it("states a reason a reader can act on, on every declared residue row", () => {
    const offenders = RESIDUE.filter((row) => row.because.length <= 40).map(
      (row) => `${row.leaf} :${row.param} (${row.reason})`
    );
    // A length floor is a floor, not a meaning check - the same limit
    // `each-or-refuse` states about its own opt-out reason.
    expect(offenders, "Say what cannot be produced and why, not just that it cannot.").toEqual([]);
  });
});

describe("a leaf is admitted only when every required input can be supplied", () => {
  /**
   * bugbot's nested-producer finding in its second shape. A positional is only
   * one KIND of required input; a `.requiredOption()` is another, and admitting
   * a leaf while supplying less than it needs tests the CLI's own refusal rather
   * than the route. Five leaves reported FAILED on live staging that way, every
   * one of them healthy.
   */
  it("admits no leaf that declares a mandatory option", () => {
    const offenders = leaves
      .filter((leaf) => graph.executable.some((executable) => executable.path === leaf.path))
      .filter((leaf) => leaf.mandatoryOptions.length > 0)
      .map((leaf) => `${leaf.path} needs ${leaf.mandatoryOptions.join(", ")}`);

    expect(offenders).toEqual([]);
  });

  it("names the flags it cannot fill on every leaf it excludes for one", () => {
    // No floor on the count: this bucket is DEBT and draining it — every
    // `.requiredOption()` leaf either bound or declared — is the good outcome.
    const offenders = graph.excluded
      .filter((leaf) => leaf.why === "requires-an-option-we-cannot-supply")
      .filter((leaf) => (leaf.unsatisfiable ?? []).length === 0)
      .map((leaf) => leaf.path);

    expect(
      offenders,
      "Excluding a leaf without naming the flag is an unactionable refusal."
    ).toEqual([]);
  });

  /**
   * 🚨 ONE `it` COLLECTING OFFENDERS, NEVER `.each` OVER `LEAF_RESIDUE`.
   *
   * Same rule as the `RESIDUE` sweep above and the same reason: this is a
   * DECLARED debt ledger whose EMPTY state is the SUCCESS state. Draining it
   * means every unsweepable leaf became sweepable, and `.each` over it — in any
   * spelling, `eachOrRefuse` included — dies at COLLECTION on that day, taking
   * every sibling check in this describe with it.
   *
   * The staleness arm that used to sit here is gone for the same reason it went
   * from the ledger spec: "a row naming a leaf that no longer exists must be
   * deleted" is a lower bound on draining data.
   */
  it("keeps every declared unsweepable leaf out of the population, with its reason", () => {
    const offenders: string[] = [];

    for (const row of LEAF_RESIDUE) {
      if (graph.executable.some((leaf) => leaf.path === row.leaf)) {
        offenders.push(`${row.leaf}: declared unsweepable and still executable`);
      }
      if (!graph.excluded.some((leaf) => leaf.path === row.leaf)) {
        offenders.push(`${row.leaf}: declared unsweepable and not excluded`);
      }
      // Evidence is the refusal verbatim, so a reader can tell a row that is
      // still true from one whose cause was fixed upstream.
      if (row.evidence.length <= 10) offenders.push(`${row.leaf}: no evidence`);
      if (row.because.length <= 40) offenders.push(`${row.leaf}: no stated reason`);
    }

    expect(offenders).toEqual([]);
  });
});

describe("ids are threaded in the right order", () => {
  /**
   * The runner passes discovered ids as positionals in ROUTE-PARAM order. That
   * is only a risk when a leaf takes more than one, and it is a silent one: two
   * ids of the same shape swapped produce a 404 that reads as a broken route
   * rather than as a harness bug.
   *
   * The alignment holds across the tree today. This pins it, so a leaf that
   * declares its positionals in a different order from its route turns the build
   * red instead of producing a mystery failure against staging.
   */
  // THREADABLE, not executable. The order invariant is a property of any leaf
  // this graph might thread, and scoping it to the EXECUTABLE subset made the
  // table empty the moment `agent-tool get` lost its producer - which
  // `eachOrRefuse` caught rather than reporting a silent zero-test pass. A leaf
  // whose params are not all resolvable still has an argv order, and it becomes
  // executable the day its producer lands; checking it only from that day is
  // checking it too late.
  const multi = leaves.filter(
    (leaf) =>
      graph.threadable.some((threadable) => threadable.path === leaf.path) &&
      leaf.requiredParams.length > 1
  );

  it.each(eachOrRefuse(multi, "every threadable leaf taking more than one id"))(
    "$path declares its positionals in route order",
    (leaf) => {
      const normalise = (name: string): string => name.replace(/[-_]/g, "").toLowerCase();
      const positionals = leaf.requiredParams.map(normalise);
      const params = routeParams(leaf.route ?? "").map(normalise);

      // NAME EQUALITY IS NOT THE INVARIANT, and asserting it directly was wrong:
      // `execution node-result` is spelled `<id> <node-id>` against
      // `:executionId/:nodeId`, so its ORDER is right and its first NAME differs.
      // A bare `id` is the CLI's convention for "the primary resource this
      // command is about", and at position 0 there is exactly one of those, so
      // it cannot be confused with anything.
      //
      // 🚨 THE ESCAPE IS DELIBERATELY ONLY AT INDEX 0. A bare `id` at any later
      // position IS ambiguous - it names no resource in particular, so nothing
      // says which route param it fills - and that is precisely the swap this
      // test exists to catch: two ids of the same shape in the wrong order
      // produce a 404 from a healthy route.
      expect(positionals).toHaveLength(params.length);
      positionals.forEach((positional, index) => {
        if (index === 0 && positional === "id") return;
        expect(positional, `positional ${index} of ${leaf.path}`).toBe(params[index]);
      });
    }
  );

  it("never plans more ids than the leaf has positionals", () => {
    for (const executable of graph.executable) {
      const raw = leaves.find((leaf) => leaf.path === executable.path);
      expect(executable.sources.length).toBe(raw?.requiredParams.length);
    }
  });
});

describe("route parsing", () => {
  it("reads params in route order", () => {
    expect(routeParams("/public/v1/agents/:agentId/tools/:toolId")).toEqual(["agentId", "toolId"]);
  });

  it("returns nothing for a collection route", () => {
    // The negative control for the assertion above: a pattern that matched
    // everything would pass the first test too.
    expect(routeParams("/public/v1/agents")).toEqual([]);
  });

  it("cuts the collection prefix at the param", () => {
    expect(collectionPrefix("/public/v1/agents/:agentId/tools", "agentId")).toBe(
      "/public/v1/agents"
    );
  });

  it("declines a param the route does not carry", () => {
    expect(collectionPrefix("/public/v1/agents", "agentId")).toBeUndefined();
  });

  it("derives plural spellings from a param name", () => {
    expect(pluralsFor("customModelId").has("custom-models")).toBe(true);
    expect(pluralsFor("roleId").has("roles")).toBe(true);
    // Negative control: it must not match an unrelated resource.
    expect(pluralsFor("roleId").has("agents")).toBe(false);
  });
});

describe("reading ids out of a producer body", () => {
  it("prefers the field named after the param", () => {
    const body = JSON.stringify({ data: [{ id: "uuid-1", slug: "my-workspace" }] });
    expect(idsFrom(body, "slug")).toEqual(["my-workspace"]);
  });

  it("falls back to id when the param has no matching field", () => {
    const body = JSON.stringify({ data: [{ id: "uuid-1" }] });
    expect(idsFrom(body, "agentId")).toEqual(["uuid-1"]);
  });

  it("reads a bare array envelope too", () => {
    expect(idsFrom(JSON.stringify([{ id: "a" }, { id: "b" }]), "id")).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty collection, so the caller can SKIP rather than pass", () => {
    expect(idsFrom(JSON.stringify({ data: [] }), "agentId")).toEqual([]);
  });

  it("returns nothing for a body that is not JSON", () => {
    expect(idsFrom("<html>gateway timeout</html>", "agentId")).toEqual([]);
  });
});
