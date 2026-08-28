import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as barrel from "./index";

/**
 * THE GATE between a resource file and the package's public surface.
 *
 * `resources/index.ts` says of itself: "Every PUBLIC resource, and nothing else
 * … membership is decided once, in this file." Nothing checked that the decision
 * was ever MADE. A resource wired onto `NexusClient` but never added to the
 * barrel is constructible by the client and un-nameable by a caller: `new
 * NexusClient(...).scores` works, `import { ScoresResource }` does not, and its
 * type is not part of the published surface.
 *
 * ── Why nothing caught it ───────────────────────────────────────────────────
 *
 * The omission is invisible to every other instrument in this package. The
 * resource compiles, its own suite passes because it constructs the class
 * directly, `client.scores` typechecks because `client.ts` imports from
 * `./scores` rather than from the barrel, and the v1 route gate only asks
 * whether a call site exists. Two resources reached `staging` this way —
 * `TracingResource` had been unreachable for as long as it has existed, and
 * `ScoresResource` was added the same way in the change that introduced this
 * file. Both were green across 334 SDK tests and 2995 CLI tests.
 *
 * `types/types-barrel-is-complete.test.ts` is the sibling that does this for the
 * TYPE barrel. Its existence is why the type half was never wrong, and its
 * absence here is why this half was wrong twice.
 *
 * ── Shape: a withheld list that must state a reason ─────────────────────────
 *
 * Every resource module is either exported from the barrel or named in
 * {@link WITHHELD} with a reason. Adding a resource and forgetting the barrel
 * fails here until someone writes down which of the two it is — the same
 * both-directions ledger the v1 gates use, for the same reason: a list nobody
 * prunes silently grows into a list of everything.
 */

/** Resource modules deliberately NOT on the public surface, and why. */
const WITHHELD: Record<string, string> = {
  "base-resource":
    "the abstract base every resource extends. Every one imports it from `./base-resource` directly and no file has ever imported it from the barrel. Withholding it by leaving it out says which of 'withheld' and 'forgotten' this is — see the barrel's own docblock."
};

const RESOURCES_DIR = __dirname;

/** Every resource module: a `.ts` file that is not a spec, a conformance helper or the barrel. */
function resourceModules(): string[] {
  return fs
    .readdirSync(RESOURCES_DIR)
    .filter(
      (f) =>
        f.endsWith(".ts") &&
        !f.endsWith(".test.ts") &&
        !f.endsWith(".conformance.ts") &&
        f !== "index.ts"
    )
    .map((f) => f.replace(/\.ts$/, ""))
    .sort();
}

/** The module specifiers the barrel re-exports from. */
function barrelModules(): string[] {
  const src = fs.readFileSync(path.join(RESOURCES_DIR, "index.ts"), "utf8");
  return [...src.matchAll(/from "\.\/([a-z0-9-]+)"/g)].map((m) => m[1]).sort();
}

describe("every public resource reaches the barrel", () => {
  /**
   * Controls. A population that resolved to nothing would satisfy every
   * assertion below by having nothing to check — which is what a renamed
   * directory, a changed suffix or a regex that stopped matching all look like.
   */
  it("reads a real population from disk and a real barrel", () => {
    const modules = resourceModules();
    const exported = barrelModules();
    expect(
      { manyModules: modules.length > 30, manyExports: exported.length > 30 },
      "both sides must be non-trivial, or the comparison below is vacuous"
    ).toEqual({ manyModules: true, manyExports: true });
    // A module known to be public, and the one known to be withheld.
    expect(modules).toContain("agents");
    expect(modules).toContain("base-resource");
  });

  it("has no resource module that is neither exported nor withheld with a reason", () => {
    const exported = new Set(barrelModules());
    const missing = resourceModules().filter((m) => !exported.has(m) && WITHHELD[m] === undefined);

    expect(
      missing,
      "each of these is constructible on NexusClient and un-nameable by a caller. " +
        "Export it from resources/index.ts, or add it to WITHHELD with the reason."
    ).toEqual([]);
  });

  it("has no withheld entry that is actually exported, or that no longer exists", () => {
    // The other direction. An exemption nobody prunes grows into a list of
    // everything, and a withheld name for a deleted file hides a real omission
    // behind a ghost.
    const exported = new Set(barrelModules());
    const modules = new Set(resourceModules());
    const contradicted = Object.keys(WITHHELD).filter((m) => exported.has(m));
    const ghosts = Object.keys(WITHHELD).filter((m) => !modules.has(m));

    expect({ contradicted, ghosts }).toEqual({ contradicted: [], ghosts: [] });
  });

  it("actually exports a value for every name the barrel lists", () => {
    // The barrel is read as TEXT above, so this is what proves the text
    // corresponds to real bindings — a re-export of a name that does not exist
    // would satisfy the regex and fail here.
    const values = Object.entries(barrel as Record<string, unknown>);
    expect(values.length).toBeGreaterThan(30);
    expect(values.filter(([, v]) => typeof v !== "function").map(([k]) => k)).toEqual([]);
  });

  it("exports the two resources that reached staging un-nameable", () => {
    // Regression fixtures. Both were wired onto NexusClient and absent from the
    // barrel; `TracingResource` for as long as it has existed.
    expect({
      scores: typeof (barrel as Record<string, unknown>).ScoresResource,
      tracing: typeof (barrel as Record<string, unknown>).TracingResource
    }).toEqual({ scores: "function", tracing: "function" });
  });
});
