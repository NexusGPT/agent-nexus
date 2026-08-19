import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eachOrRefuse } from "@nexus/types/testing/each-or-refuse";
import { describe, expect, it } from "vitest";

import { CLI_GLOBAL_OPTIONS, CLI_SURFACE } from "./cli-surface.generated";
import type { SurfaceLeaf } from "./cli-surface.model";
import {
  projectCliSurface,
  realRootProgram,
  renderCliSurfaceModule,
  renderLeaf,
  shapeOf,
  tierOf
} from "./cli-surface.project";
import { deriveCommandLeaves, deriveCommandNodes } from "./command-universe";

/**
 * THE GATE UNDER THE SURFACE MANIFEST.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A COMMITTED DERIVATION IS ONLY WORTH MORE THAN A HAND-WRITTEN LIST IF SOMETHING
 * RE-DERIVES IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `cli-surface.generated.ts` exists so that changing the CLI's public surface
 * produces a DIFF a reviewer can read. That only works while the file is forced
 * to keep up with the tree. Left unchecked it is a hand-written list with a
 * misleading header, and the day someone drops a flag the manifest keeps
 * describing the surface as it was, with generated authority behind it.
 *
 * ── WHY THE PER-LEAF TABLE, AND NOT ONLY THE BYTE COMPARISON ────────────────
 *
 * The byte comparison is the GATE: it cannot be satisfied by anything except a
 * regeneration. What it is bad at is SAYING WHAT MOVED — a 145 KB string
 * mismatch is a wall of text. So the same fact is asserted a second time, one
 * case per command path, and the case NAME is the path. A removed flag then
 * reds as `agent list` with the two rows side by side, which is the sentence a
 * reviewer needs.
 *
 * 🚨 THE TABLE IS THE UNION OF THE COMMITTED PATHS AND THE DERIVED ONES, NOT
 * EITHER ALONE, and that is the whole design. Iterating the committed rows
 * misses a leaf ADDED without regenerating — the new command simply never
 * enters the population and takes its own case away with it, which is the
 * direction a count floor is blind to. Iterating the derived rows misses a leaf
 * left behind in the manifest after its command was deleted. The union sees
 * both, and each missing side reds with a sentence naming which.
 *
 * ── NO COUNT FLOOR ANYWHERE IN THIS FILE ────────────────────────────────────
 *
 * A floor is a gate with a hole exactly the shape of the defect: a mismatched
 * item LEAVES the population and takes its own case with it, so the number goes
 * down and everything left is green. Every population here is compared as a
 * NAMED SET, in both directions, with the difference printed.
 *
 * The one thing a table cannot survive is being EMPTY — vitest registers zero
 * tests and reports the file as PASSED, at exit 0. `eachOrRefuse` is what makes
 * that a red instead.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const GENERATED = path.resolve(here, "cli-surface.generated.ts");

/**
 * ONE projection, awaited once at module scope, because `.each` needs its table
 * at COLLECTION time and a `beforeAll` runs later than that.
 *
 * It also keeps every case below to a string comparison. A test doing tens of
 * seconds of synchronous work starves vitest's poll phase and trips the worker
 * RPC timeout — everything green, exit 1, on an error naming no test.
 */
const projection = await projectCliSurface();
const fresh = new Map(projection.leaves.map((leaf) => [leaf.path, leaf]));
const committed = new Map(CLI_SURFACE.map((leaf) => [leaf.path, leaf]));

/** Every path either side knows about, so neither side can hide an omission. */
const everyPath = [...new Set([...committed.keys(), ...fresh.keys()])].sort();

function describeRow(leaf: SurfaceLeaf | undefined): string {
  return leaf === undefined ? "(absent)" : renderLeaf(leaf).trim();
}

/**
 * Narrow a lookup that must succeed, by THROWING rather than by asserting.
 *
 * A `as SurfaceLeaf` here would compile over an `undefined` and surface as
 * `Cannot read properties of undefined` inside whichever case happened to touch
 * it first — a failure naming the reader instead of the missing row.
 */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`the fixture is missing: ${what}`);
  return value;
}

describe("cli-surface — the manifest is a projection, not a list", () => {
  it("matches a fresh projection byte for byte", () => {
    expect(fs.readFileSync(GENERATED, "utf8")).toBe(renderCliSurfaceModule(projection));
  }, 60_000);

  it.each(eachOrRefuse(everyPath, "every command path in the manifest or in the tree"))(
    "%s is recorded exactly as the tree declares it",
    (leafPath) => {
      const derived = fresh.get(leafPath);
      const recorded = committed.get(leafPath);

      // Named, in both directions. Which side is missing decides the remedy:
      // a new command needs a regeneration, a stale row needs one too but for
      // the opposite reason, and a reviewer must not have to work out which.
      expect(
        derived,
        `${leafPath} is in the committed manifest and NOT in the command tree — ` +
          `the command was removed or renamed. Regenerate: ` +
          `pnpm --filter @agent-nexus/cli run gen:cli-surface`
      ).toBeDefined();
      expect(
        recorded,
        `${leafPath} is in the command tree and NOT in the committed manifest — ` +
          `a new command reached the public surface without regenerating. Run: ` +
          `pnpm --filter @agent-nexus/cli run gen:cli-surface`
      ).toBeDefined();

      // 🚨 THE REMEDY BELONGS ON THIS ASSERTION TOO, and leaving it off cost a
      // real CI cycle. A field mismatch prints two long rows and no instruction,
      // so the reader has to already know this file is generated — and the lane
      // that trips it is usually NOT the lane that added it. Measured: a sibling
      // widened the live-API sweep, 22 leaves moved `registration-only` ->
      // `safe`, and the failure named the leaves without naming the fix.
      expect(
        describeRow(recorded),
        `${leafPath} is recorded differently from what the tree declares. ` +
          `THE TREE WINS — this file is generated, so do not hand-edit the row. ` +
          `Regenerate: pnpm --filter @agent-nexus/cli run gen:cli-surface. ` +
          `NOTE: a leaf's row also carries its COMMAND_CLASSIFICATION disposition, ` +
          `so editing that table in command-universe.ts moves rows here too.`
      ).toBe(describeRow(derived));
    }
  );

  it("records the root program's global options", () => {
    expect([...CLI_GLOBAL_OPTIONS]).toEqual([...projection.globals]);
  });
});

describe("cli-surface — CONTROL: the comparison can fail", () => {
  /**
   * A per-row comparison is the shape most able to pass by comparing nothing to
   * nothing. These drive the SAME comparator the table above uses, against rows
   * mutated one field at a time, and require each to be seen.
   */
  const sample = projection.leaves.find((leaf) => leaf.flags.length > 0 && leaf.args.length > 0);

  it("finds a leaf with both flags and arguments to mutate", () => {
    expect(sample, "no leaf carries both a flag and a positional").toBeDefined();
  });

  const mutations: readonly {
    readonly name: string;
    readonly mutate: (l: SurfaceLeaf) => SurfaceLeaf;
  }[] = [
    { name: "a dropped flag", mutate: (l) => ({ ...l, flags: l.flags.slice(1) }) },
    { name: "a dropped positional", mutate: (l) => ({ ...l, args: l.args.slice(1) }) },
    { name: "a renamed path", mutate: (l) => ({ ...l, path: `${l.path}-renamed` }) },
    { name: "a leaf turned hidden", mutate: (l) => ({ ...l, hidden: true, tier: "INTERNAL" }) },
    { name: "a changed --json shape", mutate: (l) => ({ ...l, json: "(abstains)" }) },
    { name: "a changed confirmation", mutate: (l) => ({ ...l, confirm: "hand-rolled" }) },
    { name: "a changed tier", mutate: (l) => ({ ...l, tier: "UNSTABLE" }) }
  ];

  it.each(eachOrRefuse(mutations, "the one-field mutations of a sample row"))(
    "$name changes the recorded row",
    ({ mutate }) => {
      const original = must(sample, "a leaf carrying both a flag and a positional");
      expect(describeRow(mutate(original))).not.toBe(describeRow(original));
    }
  );
});

describe("cli-surface — CONTROL: the population is the whole tree", () => {
  it("holds exactly the leaves command-universe derives", async () => {
    const derived = [...(await deriveCommandLeaves())].sort();
    const recorded = CLI_SURFACE.map((leaf) => leaf.path).sort();

    // Both directions, named. `toEqual` on the arrays prints the difference,
    // which a length comparison would not.
    expect(recorded.filter((leafPath) => !derived.includes(leafPath))).toEqual([]);
    expect(derived.filter((leafPath) => !recorded.includes(leafPath))).toEqual([]);
    expect(recorded).toEqual(derived);
  }, 60_000);

  it("joins every node onto the real root program, with nothing left over", async () => {
    // The manifest is built from TWO walks — the per-registrar union for the
    // population and attribution, the root program for the structural detail.
    // Two walks of one tree is how two answers start disagreeing, so the
    // agreement is asserted rather than assumed.
    expect(projection.unjoined).toEqual([]);

    const nodePaths = (await deriveCommandNodes()).map((node) => node.path).sort();
    const programPaths = [...realRootProgram().keys()].sort();
    expect(programPaths.filter((p) => !nodePaths.includes(p))).toEqual([]);
    expect(nodePaths.filter((p) => !programPaths.includes(p))).toEqual([]);
  }, 60_000);
});

describe("cli-surface — COMPATIBILITY.md's tiers are checkable, not merely stated", () => {
  /**
   * The document assigns tiers to SURFACES; this assigns one to every leaf, so
   * the assignment can be checked instead of read.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * 🚨 A SET EQUALITY OVER THE REAL TREE CAN GO VACUOUS, AND ONE OF THESE WILL
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `expect(paths(A)).toEqual(paths(B))` is a real assertion while at least one
   * side has rows. When BOTH sides empty, it compares `[]` to `[]` and passes
   * forever, protecting nothing — and a green says nothing about which side went
   * empty. That is the same shape as the empty `.each` table `eachOrRefuse`
   * guards next door: a population that vanished reads exactly like a population
   * that agreed.
   *
   * ⚠️ IT IS NOT HYPOTHETICAL FOR THE INTERNAL TIER. INTERNAL is exactly the
   * hidden commands, and **an empty INTERNAL tier is a LEGITIMATE state** — a
   * CLI is allowed to hide nothing. So a non-empty floor on that tier is the
   * WRONG guard: it would refuse a correct tree. The population cannot be the
   * thing that carries the guarantee.
   *
   * ── SO THE RULE IS TESTED WHERE IT CANNOT EMPTY ─────────────────────────────
   *
   * `tierOf()` IS the derivation. Driven on synthetic input it answers the
   * question the set equality only answers while rows happen to exist — *does a
   * hidden leaf get INTERNAL* — and no change to the command tree can make those
   * cases vacuous, because they construct their own input.
   *
   * The set equalities stay, and they are worth keeping: they assert the
   * COMMITTED manifest agrees with the rule over the real tree, which is a
   * different claim from the rule being right. They are simply no longer the
   * only thing standing between a renamed tier and a green build.
   */
  const paths = (predicate: (leaf: SurfaceLeaf) => boolean): string[] =>
    CLI_SURFACE.filter(predicate)
      .map((leaf) => leaf.path)
      .sort();

  const CARVED_OUT = ["admin", "api", "vibe"] as const;

  it("has a manifest to reason about at all", () => {
    // The one floor in this block, and it is on the BASE population rather than
    // on any tier. An empty manifest would make every case below vacuous at
    // once; an empty tier is a legitimate reading of a real tree.
    expect(CLI_SURFACE.length).toBeGreaterThan(0);
  });

  describe("the RULE — driven on synthetic input, so no tree can empty it", () => {
    it("gives a hidden leaf INTERNAL, whatever its namespace", () => {
      expect(tierOf({ path: "agent get", hidden: true })).toBe("INTERNAL");
      // Hiddenness wins over the carve-out: a hidden `admin` leaf is still
      // hidden, which is the precedence COMPATIBILITY.md states.
      expect(tierOf({ path: "admin vibe-cost-safety get", hidden: true })).toBe("INTERNAL");
    });

    it.each(eachOrRefuse([...CARVED_OUT], "the namespaces COMPATIBILITY.md carves out of STABLE"))(
      "gives a visible %s leaf UNSTABLE",
      (namespace) => {
        expect(tierOf({ path: `${namespace} something`, hidden: false })).toBe("UNSTABLE");
      }
    );

    it("gives every other visible leaf STABLE", () => {
      expect(tierOf({ path: "agent get", hidden: false })).toBe("STABLE");
      expect(tierOf({ path: "workflow node create", hidden: false })).toBe("STABLE");
      // A namespace that merely STARTS with a carved-out name is not carved out.
      expect(tierOf({ path: "agent-eval run get", hidden: false })).toBe("STABLE");
    });

    it("CONTROL — the rule discriminates rather than answering one tier", () => {
      // Three distinct answers from three inputs. A `tierOf` hard-wired to any
      // single tier would satisfy one case above and fail here.
      const answers = new Set([
        tierOf({ path: "agent get", hidden: true }),
        tierOf({ path: "vibe app list", hidden: false }),
        tierOf({ path: "agent get", hidden: false })
      ]);
      expect([...answers].sort()).toEqual(["INTERNAL", "STABLE", "UNSTABLE"]);
    });
  });

  describe("the MANIFEST agrees with the rule over the real tree", () => {
    it("records INTERNAL on exactly the hidden leaves — 'hidden commands', verbatim", () => {
      // May legitimately compare two empty sets. The rule cases above are what
      // make that green mean something; this one adds that the COMMITTED file
      // matches, which is a claim about the artifact rather than about the rule.
      expect(paths((leaf) => leaf.tier === "INTERNAL")).toEqual(paths((leaf) => leaf.hidden));
    });

    it("records UNSTABLE on exactly the admin, api and vibe trees", () => {
      const carvedOut = new Set<string>(CARVED_OUT);
      expect(paths((leaf) => leaf.tier === "UNSTABLE")).toEqual(
        paths((leaf) => !leaf.hidden && carvedOut.has(leaf.path.split(" ")[0]))
      );
    });

    it("records STABLE on everything else, and leaves nothing untiered", () => {
      const carvedOut = new Set<string>(CARVED_OUT);
      expect(paths((leaf) => leaf.tier === "STABLE")).toEqual(
        paths((leaf) => !leaf.hidden && !carvedOut.has(leaf.path.split(" ")[0]))
      );
      expect(paths((leaf) => !["STABLE", "UNSTABLE", "INTERNAL"].includes(leaf.tier))).toEqual([]);
    });

    it("derives the same tier the manifest records, for every leaf", () => {
      const disagreements = CLI_SURFACE.filter(
        (leaf) => tierOf({ path: leaf.path, hidden: leaf.hidden }) !== leaf.tier
      ).map((leaf) => `${leaf.path}: recorded ${leaf.tier}`);
      expect(disagreements).toEqual([]);
    });
  });
});

describe("cli-surface — the destructive promise", () => {
  /**
   * `COMPATIBILITY.md` promises that a destructive command with no terminal
   * refuses, and states that the promise is held two different ways. The
   * manifest records WHICH way per leaf, read off the live `Command` through
   * `isConfirmable()` — a `WeakSet` membership placed there by `confirmable()`
   * itself, never a guess about which function a closure calls.
   */
  it("marks a confirmation on exactly the leaves that declare --yes", () => {
    const marked = CLI_SURFACE.filter((leaf) => leaf.confirm !== null)
      .map((leaf) => leaf.path)
      .sort();
    const declaring = CLI_SURFACE.filter((leaf) =>
      leaf.flags.some((flag) => /(^|,\s*)!?~?--yes\b/.test(flag))
    )
      .map((leaf) => leaf.path)
      .sort();

    expect(marked).toEqual(declaring);
    expect(marked.length, "no leaf declares --yes — the selector broke").toBeGreaterThan(0);
  });
});

describe("cli-surface — the rename-stable identity", () => {
  /**
   * `shape` is what a deprecation mechanism binds to: it survives a rename, so
   * "this leaf was renamed" is distinguishable from "one was removed and another
   * added". Two properties have to hold for that to be worth anything, and the
   * second is a LIMIT rather than a guarantee — so it is asserted as one.
   */
  it("does not change when the path changes", () => {
    const sample = must(
      CLI_SURFACE.find((leaf) => leaf.args.length > 0),
      "a leaf carrying at least one positional"
    );

    const material = {
      module: sample.module,
      args: sample.args,
      flags: sample.flags,
      description: ""
    };
    // The path is not material. Two rows differing only by path share a shape.
    expect(shapeOf(material)).toBe(shapeOf({ ...material }));
  });

  it("does change when the structure changes", () => {
    const material = { module: "m.ts", args: ["<id>"], flags: ["--json"], description: "d" };
    expect(shapeOf({ ...material, flags: [] })).not.toBe(shapeOf(material));
    expect(shapeOf({ ...material, args: [] })).not.toBe(shapeOf(material));
    expect(shapeOf({ ...material, module: "n.ts" })).not.toBe(shapeOf(material));
    expect(shapeOf({ ...material, description: "e" })).not.toBe(shapeOf(material));
  });

  /**
   * 🚨 A LOOP OVER THE COLLISION GROUPS IS VACUOUS THE DAY THERE ARE NONE, and
   * zero collisions is a state this tree can genuinely reach — every shape
   * unique is the GOOD outcome, not a broken one. A `for (group of collisions)`
   * with an empty list asserts nothing and reads identically to every group
   * having been checked.
   *
   * So the header is asserted to state the RIGHT ONE OF TWO THINGS, and both
   * branches are real assertions:
   *
   *   collisions exist  -> the header names every one of them, by member
   *   none exist        -> the header says so, in the words the renderer emits
   *
   * There is no third state, so no reading of the tree leaves this case with
   * nothing to check.
   */
  const NO_COLLISIONS_LINE = "none — every shape is unique.";

  it("states the collision groups it cannot separate — or states that there are none", () => {
    const grouped = new Map<string, string[]>();
    for (const leaf of CLI_SURFACE) {
      const group = grouped.get(leaf.shape);
      if (group === undefined) grouped.set(leaf.shape, [leaf.path]);
      else group.push(leaf.path);
    }
    const collisions = [...grouped.values()].filter((group) => group.length > 1);
    const header = fs.readFileSync(GENERATED, "utf8");

    if (collisions.length === 0) {
      // The field IS a primary key today, and the header has to say that rather
      // than leave a silently empty section a reader fills in from memory.
      expect(header).toContain(NO_COLLISIONS_LINE);
    } else {
      // A collision that exists and is not printed is the case where a reviewer
      // treats the field as a primary key and reads a rename where there is none.
      expect(header).not.toContain(NO_COLLISIONS_LINE);
      for (const group of collisions) {
        expect(header, `shape collision not named in the header: ${group.join(", ")}`).toContain(
          group.join(", ")
        );
      }
    }

    expect(collisions.map((group) => group.length)).toEqual(
      projection.shapeCollisions.map((group) => group.length)
    );
  });

  it("CONTROL — the header check would notice an unnamed group", () => {
    // Drives the same `toContain` predicate the case above uses, against a group
    // that is definitely absent. Without this, a header assertion that never ran
    // and one that ran over an absent collision look the same from the outside.
    const header = fs.readFileSync(GENERATED, "utf8");
    expect(header).not.toContain(["nonexistent one", "nonexistent two"].join(", "));
  });
});
