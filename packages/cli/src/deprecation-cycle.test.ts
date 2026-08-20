import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { describe, expect, it } from "vitest";

import { CLI_SURFACE_BASELINE } from "./cli-surface.baseline.generated";
import type { BaselineLeaf, SurfaceBaseline } from "./cli-surface.baseline.model";
import { CLI_SURFACE } from "./cli-surface.generated";
import { resolveCommandPath, resolvesToInvocableLeaf } from "./command-path";
import {
  auditDeprecationRecords,
  auditSurfaceRemovals,
  changelogAnnounces,
  changelogSections,
  compareVersions,
  nextBaseline,
  type RemovalFinding,
  renderBaselineModule
} from "./deprecation-cycle";
import { type DeprecationRecord, DEPRECATIONS } from "./deprecations";
import { buildRootProgram, VERSION } from "./root-program";

/**
 * THE GATE THAT REFUSES A REMOVAL WHICH SKIPPED ITS CYCLE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A MANIFEST MAKES A REMOVAL VISIBLE. IT DOES NOT MAKE ONE WRONG.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `cli-surface.generated.ts` turned a change to the public surface into a diff.
 * Deleting a command is still a clean regeneration and a green build — the file
 * simply describes a smaller CLI, with generated authority behind it. Every
 * removal therefore rested on a reviewer noticing, which is the state
 * `COMPATIBILITY.md` describes as a promise and nothing enforced.
 *
 * This file is the enforcement. It compares the surface of the last release
 * against the tree as it stands and refuses any STABLE path that stopped
 * answering without an alias or a served deprecation cycle.
 *
 * ── WHY THE RULE IS DRIVEN ON SYNTHETIC INPUT FIRST ─────────────────────────
 *
 * 🚨 `DEPRECATIONS` IS EMPTY TODAY, AND AN EMPTY LIST IS THE NORMAL STATE. A
 * suite that took its cases from the declared records would assert nothing at
 * all right now and would read green while doing it — the same shape as the
 * empty `.each` table `eachOrRefuse` refuses next door, and the same shape
 * `cli-surface.codegen.test.ts` avoids by driving `tierOf()` on constructed
 * input.
 *
 * So the first block below constructs its own baseline, its own surface and its
 * own records. No change to the command tree, and no release, can make those
 * cases vacuous. The live block that follows asserts the SHIPPED artifacts agree
 * with the rule, which is a different and weaker claim — and it says so.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const CHANGELOG = fs.readFileSync(path.resolve(here, "..", "CHANGELOG.md"), "utf8");
const BASELINE_FILE = path.resolve(here, "cli-surface.baseline.generated.ts");
const LIVE_CHANGELOG = changelogSections(CHANGELOG);

// ───────────────────────────────────────────────────────────────────────────
// THE FIXTURE. Everything the rule reads, constructed, so nothing can empty it.
// ───────────────────────────────────────────────────────────────────────────

/** A tiny changelog with two shipped releases, one of which announces a path. */
const FIXTURE_CHANGELOG = changelogSections(
  [
    "# Changelog",
    "",
    "## 1.1.0",
    "",
    "- Deprecated: `demo gone` will be removed in 1.2.0. Use `demo replacement` instead.",
    "",
    "## 1.0.0",
    "",
    "- First release, with `demo kept` in it.",
    ""
  ].join("\n")
);

const leaf = (leafPath: string, shape: string, tier: BaselineLeaf["tier"]): BaselineLeaf => ({
  path: leafPath,
  shape,
  tier
});

const BASELINE: SurfaceBaseline = {
  version: "1.1.0",
  leaves: [
    leaf("demo kept", "aaaa00000001", "STABLE"),
    leaf("demo gone", "aaaa00000002", "STABLE"),
    leaf("demo renamed", "aaaa00000003", "STABLE"),
    leaf("demo aliased", "aaaa00000004", "STABLE"),
    leaf("admin gone", "aaaa00000005", "UNSTABLE"),
    leaf("demo secret", "aaaa00000006", "INTERNAL"),
    leaf("demo twin-a", "aaaa0000dupe", "STABLE"),
    leaf("demo twin-b", "aaaa0000dupe", "STABLE")
  ],
  deprecations: ["aaaa00000002"]
};

/** The tree as it stands: `demo gone`, `admin gone`, `demo secret` and a twin are absent. */
const CURRENT: readonly BaselineLeaf[] = [
  leaf("demo kept", "aaaa00000001", "STABLE"),
  leaf("demo moved", "aaaa00000003", "STABLE"),
  leaf("demo now", "aaaa00000004", "STABLE"),
  leaf("demo twin-b", "aaaa0000dupe", "STABLE")
];

/** `demo aliased` still resolves — the new command kept the old name as an alias. */
const RESOLVES = (leafPath: string): boolean => leafPath === "demo aliased";

const SERVED: DeprecationRecord = {
  shape: "aaaa00000002",
  path: "demo gone",
  announcedIn: "1.1.0",
  removeIn: "1.2.0",
  replacement: "nexus demo kept",
  reason: "It duplicated `demo kept`."
};

function audit(
  overrides: {
    readonly baseline?: SurfaceBaseline;
    readonly current?: readonly BaselineLeaf[];
    readonly records?: readonly DeprecationRecord[];
    readonly changelog?: ReadonlyMap<string, string>;
  } = {}
): ReadonlyMap<string, RemovalFinding> {
  const findings = auditSurfaceRemovals({
    baseline: overrides.baseline ?? BASELINE,
    current: overrides.current ?? CURRENT,
    resolves: RESOLVES,
    records: overrides.records ?? [SERVED],
    changelog: overrides.changelog ?? FIXTURE_CHANGELOG
  });
  return new Map(findings.map((finding) => [finding.path, finding]));
}

function findingFor(leafPath: string, overrides?: Parameters<typeof audit>[0]): RemovalFinding {
  const finding = audit(overrides).get(leafPath);
  // THROWN, not asserted. An `as RemovalFinding` here would compile over an
  // `undefined` and surface as a property read on nothing, naming the reader
  // instead of the row that went missing.
  if (finding === undefined) throw new Error(`the fixture has no finding for ${leafPath}`);
  return finding;
}

// ───────────────────────────────────────────────────────────────────────────

describe("deprecation cycle — THE RULE, on input this suite constructs", () => {
  const CASES: readonly {
    readonly name: string;
    readonly leafPath: string;
    readonly overrides?: Parameters<typeof audit>[0];
    readonly verdict: RemovalFinding["verdict"];
    readonly permitted: boolean;
  }[] = [
    {
      name: "a path still in the tree is PRESENT and asks nothing",
      leafPath: "demo kept",
      verdict: "present",
      permitted: true
    },
    {
      name: "a path that still RESOLVES through an alias is the sanctioned rename",
      leafPath: "demo aliased",
      verdict: "aliased",
      permitted: true
    },
    {
      name: "a STABLE rename with NO alias is a MOVE, and it is a break",
      leafPath: "demo renamed",
      verdict: "moved",
      permitted: false
    },
    {
      name: "a STABLE leaf gone with a SERVED cycle is permitted",
      leafPath: "demo gone",
      verdict: "removed",
      permitted: true
    },
    {
      name: "a STABLE leaf gone with NO record at all is refused",
      leafPath: "demo gone",
      overrides: { records: [] },
      verdict: "removed",
      permitted: false
    },
    {
      name: "a record the baseline never captured is an announcement and a removal in one release",
      leafPath: "demo gone",
      overrides: { baseline: { ...BASELINE, deprecations: [] } },
      verdict: "removed",
      permitted: false
    },
    {
      name: "an announcement from a release that has not shipped is refused",
      leafPath: "demo gone",
      overrides: { records: [{ ...SERVED, announcedIn: "9.9.9", removeIn: "10.0.0" }] },
      verdict: "removed",
      permitted: false
    },
    {
      name: "an announcement whose CHANGELOG entry never names the path is refused",
      leafPath: "demo gone",
      overrides: { records: [{ ...SERVED, announcedIn: "1.0.0", removeIn: "1.1.0" }] },
      verdict: "removed",
      permitted: false
    },
    {
      name: "a removeIn that is not after announcedIn is not a cycle",
      leafPath: "demo gone",
      overrides: { records: [{ ...SERVED, removeIn: "1.1.0" }] },
      verdict: "removed",
      permitted: false
    },
    {
      name: "two records for one shape leave it undecidable, so it is refused",
      leafPath: "demo gone",
      overrides: { records: [SERVED, { ...SERVED, removeIn: "2.0.0" }] },
      verdict: "removed",
      permitted: false
    },
    {
      name: "an UNSTABLE leaf may vanish in any release, without notice",
      leafPath: "admin gone",
      verdict: "removed",
      permitted: true
    },
    {
      name: "an INTERNAL leaf promises nothing at all",
      leafPath: "demo secret",
      verdict: "removed",
      permitted: true
    },
    {
      name: "a leaf inside a SHAPE COLLISION cannot be called moved, so it degrades to removed",
      leafPath: "demo twin-a",
      verdict: "removed",
      permitted: false
    }
  ];

  it.each(eachOrRefuse(CASES, "the constructed removal cases"))(
    "$name",
    ({ leafPath, overrides, verdict, permitted }) => {
      const finding = findingFor(leafPath, overrides);
      expect(finding.verdict, finding.reason).toBe(verdict);
      expect(finding.permitted, finding.reason).toBe(permitted);
    }
  );

  it("reads the tier off the BASELINE row, never off the path it is looking at", () => {
    // `admin …` is UNSTABLE by namespace everywhere else in this package. A row
    // recorded STABLE must still be judged STABLE — otherwise a leaf hidden or
    // moved under a carved-out namespace in the same commit that deletes it
    // launders its way out of the promise it was under.
    const laundered: SurfaceBaseline = {
      ...BASELINE,
      leaves: [leaf("admin gone", "aaaa00000005", "STABLE")]
    };
    const finding = findingFor("admin gone", { baseline: laundered, records: [] });
    expect(finding.permitted).toBe(false);
    expect(finding.reason).toContain("no deprecation record");
  });

  it("names the alias as the cure on a MOVE, because that is the cheap one", () => {
    const finding = findingFor("demo renamed");
    expect(finding.movedTo).toBe("demo moved");
    expect(finding.reason).toContain('.alias("renamed")');
  });

  it("CONTROL — the rule produces every verdict and both permissions", () => {
    // A rule hard-wired to one answer satisfies whichever cases happen to want
    // that answer and fails here. Without this, a `permitted: true` stub passes
    // five cases above and a `verdict: "removed"` stub passes six.
    const findings = [...audit().values()];
    expect([...new Set(findings.map((finding) => finding.verdict))].sort()).toEqual([
      "aliased",
      "moved",
      "present",
      "removed"
    ]);
    expect([...new Set(findings.map((finding) => finding.permitted))].sort()).toEqual([
      false,
      true
    ]);
  });

  it("CONTROL — the audit covers the whole baseline, not the interesting rows", () => {
    // A population that silently shrinks is how a gate stops seeing the case it
    // was built for while every remaining assertion stays green.
    expect([...audit().keys()].sort()).toEqual(BASELINE.leaves.map((row) => row.path).sort());
  });
});

describe("deprecation cycle — the version comparison", () => {
  const CASES: readonly { readonly a: string; readonly b: string; readonly sign: number }[] = [
    { a: "0.26.0", b: "0.26.0", sign: 0 },
    { a: "0.9.0", b: "0.26.0", sign: -1 },
    // 🚨 THE ONE THAT MATTERS. A string comparison answers `true` for
    // `"0.100.0" <= "0.26.0"`, which would accept an announcement from a release
    // that has not happened and walk the whole gate around with a version number.
    { a: "0.100.0", b: "0.26.0", sign: 1 },
    { a: "1.0.0", b: "0.99.99", sign: 1 },
    { a: "0.26.1", b: "0.26.0", sign: 1 }
  ];

  it.each(eachOrRefuse(CASES, "the version comparisons"))("$a vs $b", ({ a, b, sign }) => {
    expect(compareVersions(a, b)).toBe(sign);
  });

  it("CONTROL — a lexicographic comparison would disagree with at least one case", () => {
    // Proves the table above is discriminating rather than agreeing with the
    // cheap implementation it exists to rule out.
    const disagreements = CASES.filter(({ a, b, sign }) => {
      const lexical = a === b ? 0 : a < b ? -1 : 1;
      return lexical !== sign;
    });
    expect(disagreements.length).toBeGreaterThan(0);
  });

  it("refuses a version it cannot parse rather than guessing", () => {
    expect(compareVersions("1.2", "1.2.0")).toBeNull();
    expect(compareVersions("1.2.0-beta.1", "1.2.0")).toBeNull();
  });
});

describe("deprecation cycle — the record hygiene rule, constructed", () => {
  const clean = (): DeprecationRecord => ({ ...SERVED, path: "demo kept", shape: "aaaa00000001" });

  /**
   * Every problem this record produces, joined.
   *
   * JOINED rather than indexed, because a record is usually wrong in more than
   * one way at once and `[0]` asserts on whichever check happens to run first —
   * an assertion that goes green or red on the ORDER of the implementation
   * rather than on its findings.
   */
  const violate = (record: DeprecationRecord, current = CURRENT): string =>
    auditDeprecationRecords({
      baseline: BASELINE,
      current,
      records: [record],
      changelog: FIXTURE_CHANGELOG
    })
      .map((violation) => violation.problem)
      .join(" | ");

  it("passes a record whose path and shape agree with the live surface", () => {
    // The changelog entry for 1.1.0 names `demo gone`, not `demo kept`, so the
    // announcement check has to fire — this record is deliberately built to be
    // clean on everything else.
    expect(violate({ ...clean(), announcedIn: "1.0.0", removeIn: "1.1.0" })).toBe("");
  });

  it("catches a path that drifted away from its shape", () => {
    expect(violate({ ...clean(), path: "demo elsewhere", announcedIn: "1.0.0" })).toContain(
      "currently attached to nothing"
    );
  });

  it("catches a record that names a leaf nobody promised any more", () => {
    expect(
      violate({ ...clean(), shape: "ffff00000000", path: "demo ghost", announcedIn: "1.0.0" })
    ).toContain("Delete the record");
  });

  it("refuses to key a record on a shape two leaves share", () => {
    expect(
      violate({ ...clean(), shape: "aaaa0000dupe", path: "demo twin-b", announcedIn: "1.0.0" }, [
        ...CURRENT,
        leaf("demo twin-c", "aaaa0000dupe", "STABLE")
      ])
    ).toContain("shared by 2 leaves");
  });

  it("catches a version that is not x.y.z, and a cycle shorter than one release", () => {
    expect(violate({ ...clean(), announcedIn: "1.1", removeIn: "1.1" })).toContain("not x.y.z");
    expect(violate({ ...clean(), announcedIn: "1.0.0", removeIn: "1.0.0" })).toContain(
      "A cycle is at least one release long"
    );
  });

  it("catches a shipped announcement whose entry never names the path", () => {
    // The 1.1.0 entry announces `demo gone` and never says `demo kept`.
    expect(violate({ ...clean(), announcedIn: "1.1.0", removeIn: "1.2.0" })).toContain(
      "never announces"
    );
  });

  it("CONTROL — the hygiene rule is capable of returning nothing", () => {
    // Every case above asserts a violation. Without this, a rule that flagged
    // EVERY record would satisfy all of them and protect nothing.
    expect(violate({ ...clean(), announcedIn: "1.0.0", removeIn: "1.1.0" })).toBe("");
  });
});

describe("deprecation cycle — the SHIPPED artifacts agree with the rule", () => {
  /**
   * Weaker than the block above and deliberately kept anyway: it asserts the
   * committed baseline, the committed manifest and the live command tree agree
   * TODAY, which is a claim about the artifacts rather than about the rule.
   */
  const program = buildRootProgram(VERSION);
  const current: readonly BaselineLeaf[] = CLI_SURFACE.map((row) => ({
    path: row.path,
    shape: row.shape,
    tier: row.tier
  }));
  const live = auditSurfaceRemovals({
    baseline: CLI_SURFACE_BASELINE,
    current,
    resolves: (leafPath) => resolvesToInvocableLeaf(program, leafPath),
    records: DEPRECATIONS,
    changelog: LIVE_CHANGELOG
  });

  it("has a baseline to reason about at all", () => {
    // The one floor here, and it is on the base population. An empty baseline
    // would make every case below compare nothing to nothing, at exit 0.
    expect(CLI_SURFACE_BASELINE.leaves.length).toBeGreaterThan(0);
    expect(live.length).toBe(CLI_SURFACE_BASELINE.leaves.length);
  });

  it("promises nothing from a version that has not shipped", () => {
    const drift = compareVersions(CLI_SURFACE_BASELINE.version, VERSION);
    expect(
      drift,
      `the baseline claims ${CLI_SURFACE_BASELINE.version} and this package is ${VERSION}`
    ).not.toBeNull();
    expect(drift === null ? 1 : drift).toBeLessThanOrEqual(0);
  });

  it("REFUSES every path the last release promised and this tree no longer answers", () => {
    const refused = live.filter((finding) => !finding.permitted);
    expect(
      refused.map((finding) => finding.reason),
      "A command the last release promised has stopped answering. Either keep the old " +
        "name as an alias on the new command, or serve a deprecation cycle: add a record " +
        "to DEPRECATIONS in src/deprecations.ts, write the CHANGELOG.md entry naming the " +
        "path, ship that release, and remove the command in a later one."
    ).toEqual([]);
  });

  it("carries no defective deprecation record", () => {
    expect(
      auditDeprecationRecords({
        baseline: CLI_SURFACE_BASELINE,
        current,
        records: DEPRECATIONS,
        changelog: LIVE_CHANGELOG
      }).map((violation) => `${violation.path}: ${violation.problem}`)
    ).toEqual([]);
  });

  it("CONTROL — the live audit actually read the real rows", () => {
    // `toEqual([])` on the refusals is green over an empty population too, and
    // an empty population is exactly what a broken join produces. This names
    // what the audit DID see.
    const verdicts = new Set(live.map((finding) => finding.verdict));
    expect(verdicts.has("present"), `verdicts seen: ${[...verdicts].join(", ")}`).toBe(true);
    expect(live.filter((finding) => finding.verdict === "present").length).toBeGreaterThan(400);
  });

  it("CONTROL — a promised path that vanished IS refused, against the real artifacts", () => {
    // The mutation, in-suite: one synthetic STABLE row the tree cannot answer.
    // Without it, the refusal case above is green whether the rule works or not,
    // because nothing has been removed from this CLI yet.
    const refused = auditSurfaceRemovals({
      baseline: {
        ...CLI_SURFACE_BASELINE,
        leaves: [...CLI_SURFACE_BASELINE.leaves, leaf("agent vanished", "0bad0bad0bad", "STABLE")]
      },
      current,
      resolves: (leafPath) => resolvesToInvocableLeaf(program, leafPath),
      records: DEPRECATIONS,
      changelog: LIVE_CHANGELOG
    }).filter((finding) => !finding.permitted);

    // CONTAINS, never equals. A set equality here would also red whenever the
    // tree legitimately has another refusal in flight, which makes this control
    // report on the tree instead of on itself — and a control that fails for a
    // reason other than the one it tests is a control nobody trusts.
    const synthetic = refused.find((finding) => finding.path === "agent vanished");
    expect(synthetic, `refusals seen: ${refused.map((f) => f.path).join(", ")}`).toBeDefined();
    expect(synthetic?.reason).toContain("no deprecation record");
  });

  it("REFUSES a leaf turned into a NAMESPACE, which still resolves and no longer acts", () => {
    // The hole a resolution test alone cannot see. `access-card delete` gaining
    // subcommands leaves `nexus access-card delete <id>` parsing and printing a
    // help screen instead of deleting — a break wearing the shape of a rename.
    const mutated = buildRootProgram(VERSION);
    const turned = resolveCommandPath(mutated, "access-card delete");
    expect(turned, "the fixture leaf is gone from the tree").toBeDefined();
    turned?.command("card").description("battery fixture");

    // The old predicate — "is there a node here" — still says yes. That is
    // exactly why the gate may not use it.
    expect(resolveCommandPath(mutated, "access-card delete")).toBeDefined();
    expect(resolvesToInvocableLeaf(mutated, "access-card delete")).toBe(false);

    const finding = auditSurfaceRemovals({
      baseline: {
        ...CLI_SURFACE_BASELINE,
        leaves: [leaf("access-card delete", "0bad0bad0bad", "STABLE")]
      },
      // The path is absent from the surface too, because a node with children is
      // not a leaf — the same definition on both sides.
      current: current.filter((row) => row.path !== "access-card delete"),
      resolves: (leafPath) => resolvesToInvocableLeaf(mutated, leafPath),
      records: DEPRECATIONS,
      changelog: LIVE_CHANGELOG
    })[0];

    expect(finding.verdict).toBe("removed");
    expect(finding.permitted).toBe(false);
  });

  it("CONTROL — an alias on the real tree is not read as a removal", () => {
    // `task-eval` carries the alias `eval`, and COMPATIBILITY.md names it as the
    // shape a rename takes here. If this ever reads as a removal, the mechanism
    // refuses the one rename the contract sanctions.
    expect(resolveCommandPath(program, "task-eval")).toBeDefined();
    const aliasPath = CLI_SURFACE_BASELINE.leaves
      .map((row) => row.path)
      .find((row) => row.startsWith("task-eval "));
    expect(aliasPath, "no task-eval leaf in the baseline").toBeDefined();

    const aliased = (aliasPath ?? "").replace(/^task-eval /, "eval ");
    expect(resolveCommandPath(program, aliased), `${aliased} stopped resolving`).toBeDefined();

    const finding = auditSurfaceRemovals({
      baseline: {
        ...CLI_SURFACE_BASELINE,
        leaves: [leaf(aliased, "0bad0bad0bad", "STABLE")]
      },
      current,
      resolves: (leafPath) => resolvesToInvocableLeaf(program, leafPath),
      records: DEPRECATIONS,
      changelog: LIVE_CHANGELOG
    })[0];

    expect(finding.verdict).toBe("aliased");
    expect(finding.permitted).toBe(true);
  });
});

describe("deprecation cycle — the baseline file is what the generator writes", () => {
  /**
   * NOT a byte comparison against the CURRENT tree, and that is the whole point.
   * A baseline is SUPPOSED to lag: every command added since the last release is
   * legitimately absent from it. Asserting equality with a fresh projection
   * would be red for the whole of every cycle, and a gate that is red by design
   * teaches its reader to regenerate without looking — which re-promises the
   * tree and empties the mechanism.
   *
   * What IS asserted is that the file is the renderer's own output for the data
   * it holds. That catches a hand edit to a row, to the version, or to the
   * deprecation set, which is the walk-around this design cannot otherwise close.
   */
  it("is byte-for-byte what renderBaselineModule produces for its own contents", () => {
    expect(fs.readFileSync(BASELINE_FILE, "utf8")).toBe(renderBaselineModule(CLI_SURFACE_BASELINE));
  });

  it("CONTROL — the round trip would notice a changed row", () => {
    const tampered = renderBaselineModule({
      ...CLI_SURFACE_BASELINE,
      leaves: CLI_SURFACE_BASELINE.leaves.map((row, index) =>
        index === 0 ? { ...row, shape: "0000deadbeef" } : row
      )
    });
    expect(tampered).not.toBe(fs.readFileSync(BASELINE_FILE, "utf8"));
  });

  it("is sorted and free of duplicates, so a lookup cannot be ambiguous", () => {
    const paths = CLI_SURFACE_BASELINE.leaves.map((row) => row.path);
    expect(paths).toEqual([...paths].sort((left, right) => left.localeCompare(right)));
    expect(paths.length).toBe(new Set(paths).size);

    const shapes = [...CLI_SURFACE_BASELINE.deprecations];
    expect(shapes).toEqual([...shapes].sort());
    expect(shapes.length).toBe(new Set(shapes).size);
  });

  it("does NOT carry forward a record whose leaf it no longer promises", () => {
    // The deadlock: re-capturing a spent tombstone makes the hygiene rule demand
    // its deletion while this function demands its presence, and no order of the
    // two reaches a green tree. Driven on constructed rows so no state of the
    // real tree can empty it.
    const spent = {
      shape: "0000spentrec",
      path: "demo gone",
      announcedIn: "1.0.0",
      removeIn: "1.1.0",
      replacement: null,
      reason: "already removed"
    };
    const live = { ...spent, shape: "0000liverecd", path: "demo kept" };

    const built = nextBaseline({
      version: "1.2.0",
      leaves: [leaf("demo kept", "0000liverecd", "STABLE")],
      records: [spent, live]
    });

    expect(built.deprecations).toEqual(["0000liverecd"]);
  });

  it("is what `nextBaseline` would build from its own rows", () => {
    // The renderer round trip above catches a hand-edited ROW. This catches a
    // hand-edited ORDER or a duplicate that the renderer would happily print
    // back — `nextBaseline` is what the generator calls, so the file is asserted
    // against the shape the generator produces rather than only against itself.
    expect(
      nextBaseline({
        version: CLI_SURFACE_BASELINE.version,
        leaves: CLI_SURFACE_BASELINE.leaves,
        records: DEPRECATIONS
      })
    ).toEqual({ ...CLI_SURFACE_BASELINE, deprecations: DEPRECATIONS.map((r) => r.shape).sort() });
  });
});

describe("deprecation cycle — the changelog has to announce THIS command", () => {
  /**
   * A command path is a PREFIX and a SUFFIX of other command paths, so a bare
   * `entry.includes(path)` spends a cycle on an entry that announced a different
   * leaf. Every accepted row and every refused row below is a real changelog
   * sentence shape, not a synthetic string.
   */
  const CASES: readonly {
    readonly name: string;
    readonly entry: string;
    readonly path: string;
    readonly announced: boolean;
  }[] = [
    {
      name: "a bare backticked command",
      entry: "- Deprecated: `agent list` is going away in 1.2.0.",
      path: "agent list",
      announced: true
    },
    {
      name: "the binary name in front of it",
      entry: "- Deprecated: `nexus agent list` is going away.",
      path: "agent list",
      announced: true
    },
    {
      name: "a whole invocation with an argument and a pipe",
      entry: "Piped, they destroyed without asking: `nexus customer delete <id> | tee log`.",
      path: "customer delete",
      announced: true
    },
    {
      name: "a whole invocation with a flag",
      entry: "Run `nexus agent list --json` instead.",
      path: "agent list",
      announced: true
    },
    {
      name: "REFUSED — the path is a prefix of a LONGER leaf name",
      entry: "- Deprecated: `agent list-templates` is going away.",
      path: "agent list",
      announced: false
    },
    {
      name: "REFUSED — the path is a SUFFIX of a longer command",
      entry: "- Deprecated: `workflow agent list` is going away.",
      path: "agent list",
      announced: false
    },
    {
      name: "REFUSED — the path is a PREFIX of a deeper command",
      entry: "- Deprecated: `agent list templates` is going away.",
      path: "agent list",
      announced: false
    },
    {
      name: "REFUSED — a mention in prose, outside any code span",
      entry: "- We are thinking about agent list and what to do with it.",
      path: "agent list",
      announced: false
    },
    {
      name: "REFUSED — an entry that says nothing about this leaf",
      entry: "- Added: `agent search`.",
      path: "agent list",
      announced: false
    }
  ];

  it.each(eachOrRefuse(CASES, "the changelog announcement cases"))(
    "$name",
    ({ entry, path: leafPath, announced }) => {
      expect(changelogAnnounces(entry, leafPath)).toBe(announced);
    }
  );

  it("CONTROL — a bare substring test would disagree on the three near misses", () => {
    // Names exactly what this function exists to be better than. Without it, a
    // reimplementation as `entry.includes(path)` passes four of the cases above
    // and this file would not say which four mattered.
    const nearMisses = CASES.filter((row) => !row.announced && row.entry.includes(row.path));
    expect(nearMisses.map((row) => row.name).length).toBe(4);
  });
});
