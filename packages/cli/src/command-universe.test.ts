import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  classifyCommandUniverse,
  COMMAND_CLASSIFICATION,
  deriveCommandLeaves,
  deriveCommandModules,
  deriveCommandNamespaces,
  deriveCommandNodes,
  discoverRootRegistrars,
  flattenCommands,
  unattributedHiddenSiblings
} from "./command-universe";

/**
 * THE GATE THAT MAKES A NEW COMMAND IMPOSSIBLE TO ADD SILENTLY.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A VITEST SPEC AND NOT A WORKFLOW
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `Tests: Vitest` is a REQUIRED check on `staging` and on `main`, it already
 * runs `pnpm --filter @agent-nexus/cli run test`, and `@agent-nexus/cli` is
 * already in `ci-affected.ts`'s `test_vitest.packages` — so a PR touching this
 * package turns the job on. Landing the gate here therefore needs no workflow
 * edit and no branch-protection change: it blocks from its first commit.
 *
 * `CLI: Sweep` was the other candidate and is the wrong one. It is NOT a
 * required check, so a red sweep is a red square nobody has to clear, and it
 * needs a live staging API plus a secret — a gate that answers "is this list
 * complete" must not be able to fail for reasons that have nothing to do with
 * the list. This spec reads source and nothing else.
 *
 * ── WHAT IT ACTUALLY ASSERTS ─────────────────────────────────────────────────
 *
 * The population is DERIVED from the commander tree and the disposition is
 * DECLARED, so the only two ways to be wrong are both checked here: a leaf the
 * tree has and the table does not, and a path the table has and the tree does
 * not. Neither has a default. That is the whole mechanism — a hand-maintained
 * list beside an evolving CLI cannot go quietly stale if something red-flags
 * every divergence on the commit that creates it.
 */

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Pay the walk ONCE, on a budget that is not the default 5s.
 *
 * 🚨 THIS IS A FLAKE FIX, AND THE FLAKE READ AS SOMETHING ELSE. The walk
 * imports every module in `src/commands/`, and whichever case ran first paid
 * that cost inside its own 5000ms budget. Measured on an IDLE machine, this
 * file alone: `tests 4.27s` — 85% of the ceiling with nothing else running. Any
 * load at all tips it over, so a full run failed here with
 * `Test timed out in 5000ms` while the same file passed on its own.
 *
 * That shape invites the wrong diagnosis — "contention from a parallel job,
 * re-run it" — and a re-run does clear it, which is exactly what makes the
 * misreading stick. The cost is real and it is in this file; the load only
 * decides which side of the line it lands on.
 *
 * Node's module cache makes every later call cheap, so warming here is enough
 * for all four describes. `cli-docs-are-generated.test.ts` carries the same fix
 * for the same walk and says why: a gate that flakes is a gate somebody
 * switches off.
 */
beforeAll(async () => {
  await classifyCommandUniverse();
}, 60_000);

describe("the command universe is derived, and every leaf is classified", () => {
  it("classifies every leaf the commander tree registers", async () => {
    const { unclassified } = await classifyCommandUniverse();

    expect(
      unclassified,
      unclassified.length === 0
        ? ""
        : [
            "",
            `${unclassified.length} command(s) exist in the CLI and are classified nowhere.`,
            "",
            "Add each to COMMAND_CLASSIFICATION in src/command-universe.ts:",
            '  "safe"              read-only, no required input, emits --json — the sweep RUNS it',
            '  "registration-only" a mutation, or a read needing an argument — existence only',
            '  "never-execute"     interactive, self-modifying, or credential-destroying',
            "",
            ...unclassified.map((path) => `  · ${path}`),
            ""
          ].join("\n")
    ).toEqual([]);
  });

  it("carries no classification for a command the tree no longer has", async () => {
    const { stale } = await classifyCommandUniverse();

    expect(
      stale,
      stale.length === 0
        ? ""
        : [
            "",
            `${stale.length} classified path(s) no longer exist in the CLI.`,
            "A rename gets reflected here; a disappearance gets reverted. Deleting the",
            "line is only correct once you know which of the two happened.",
            "",
            ...stale.map((path) => `  · ${path}`),
            ""
          ].join("\n")
    ).toEqual([]);
  });

  it("finds the whole tree, not a fragment of it", async () => {
    const { observed, safe } = await classifyCommandUniverse();

    // A deriver that silently found nothing would satisfy both assertions
    // above — zero leaves are trivially all classified. These two floors turn
    // "the walk broke" from a green into a red. They are floors and not exact
    // counts on purpose: an exact count is a second inventory to maintain.
    expect(observed.length).toBeGreaterThan(400);
    expect(safe.length).toBeGreaterThan(30);
  });
});

describe("every registrar the derivation finds is one the CLI actually calls", () => {
  it("finds a call site in src/ for each root registrar", () => {
    // Scan ALL of `src/` outside `commands/`, not one named file. The first
    // version of this check read `src/index.ts` alone and went to zero matches
    // the moment a sibling moved the registrations into a `root-program.ts` —
    // reporting every registrar in the CLI as an orphan. WHERE the call sites
    // live is somebody else's decision and it changed twice in an hour; THAT
    // they exist is the invariant.
    const sourceRoot = join(PACKAGE_ROOT, "src");
    const called = new Set<string>();

    const scan = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "commands") scan(full);
          continue;
        }
        if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
        for (const match of readFileSync(full, "utf8").matchAll(/\b(register\w+)\s*\(/g)) {
          called.add(match[1]);
        }
      }
    };
    scan(sourceRoot);

    return discoverRootRegistrars().then((discovered) => {
      const orphans = discovered
        .filter((registrar) => !called.has(registrar.name))
        .map((registrar) => `${registrar.name} (${registrar.module})`);

      expect(
        orphans,
        orphans.length === 0
          ? ""
          : `\nRegistrar(s) defined in src/commands but called nowhere in src/:\n${orphans
              .map((entry) => `  \u00b7 ${entry}`)
              .join("\n")}\n`
      ).toEqual([]);
    });
  });

  it("attributes every namespace to exactly one module", async () => {
    const claims = new Map<string, string[]>();
    for (const module of await deriveCommandModules()) {
      for (const root of module.roots) {
        claims.set(root.name, [...(claims.get(root.name) ?? []), module.sourceModule]);
      }
    }

    // Two modules registering the same top-level name would make attribution
    // first-wins and silent. Commander enforces nothing here.
    const contested = [...claims.entries()]
      .filter(([, modules]) => modules.length > 1)
      .map(([name, modules]) => `${name}: ${modules.join(", ")}`);
    expect(contested).toEqual([]);

    for (const namespace of await deriveCommandNamespaces()) {
      expect(namespace.sourceModule, `${namespace.name} is attributed to no module`).not.toBe("");
    }
  });
});

describe("sweep.sh keeps no second copy of the inventory", () => {
  it("declares no command list of its own", () => {
    const sweep = readFileSync(join(PACKAGE_ROOT, "scripts", "sweep.sh"), "utf8");

    // The whole point of this module is that ONE place says which commands
    // exist and what may be done with them. A bash array of command paths
    // reintroduced beside it would drift from this table in silence, which is
    // the exact defect the derivation deletes.
    //
    // Anchored to the start of a line, because a bare substring match is the
    // wrong test: `SWEEP_TARGETS=()` contains "LEAVES=(" and is the empty
    // accumulator the derived list is read INTO. A guard that reds on the fix
    // it is guarding gets deleted.
    for (const banned of ["LEAVES", "REGISTRATION_ONLY", "EXCLUDED"]) {
      expect(sweep, `sweep.sh reintroduced a hand-maintained "${banned}=(...)" array`).not.toMatch(
        new RegExp(`^${banned}=\\(`, "m")
      );
    }
  });

  it("agrees with sweep.sh about which leaves are safe to execute", async () => {
    const { safe } = await classifyCommandUniverse();

    // sweep.sh gets its leaves by running `--print-safe-leaves` against this
    // table, so the two cannot disagree. Pin the contract that lets it: the
    // safe set is non-empty, every entry is a real path, and none of them is a
    // bare namespace, which would sweep a group's help text instead of a leaf.
    //
    // `safe` is the EXECUTED set, so it holds both executable dispositions.
    // This used to assert `=== "safe"` and it caught the day the second one was
    // added, which is the assertion working rather than failing — the two lists
    // really would have gone out of step. Naming both is stronger than widening
    // to a truthiness check: a leaf that is `registration-only` or
    // `never-execute` still cannot appear here.
    expect(safe.length).toBeGreaterThan(0);
    for (const path of safe) {
      expect(["safe", "safe-with-fixture"]).toContain(COMMAND_CLASSIFICATION[path]);
      expect(path.trim()).toBe(path);
    }

    // And the converse, which the old assertion could not express: every
    // executable leaf in the table REACHES the executed set. A disposition
    // added to the union and forgotten in `classifyCommandUniverse` would be
    // declared, asserted about, and never actually run.
    const executable = Object.entries(COMMAND_CLASSIFICATION)
      .filter(([, disposition]) => disposition === "safe" || disposition === "safe-with-fixture")
      .map(([path]) => path)
      .sort();
    expect([...safe].sort()).toEqual(executable);
  });
});

describe("one walk carries the metadata a rendering throws away", () => {
  it("returns namespace nodes as well as leaves", async () => {
    const nodes = await deriveCommandNodes();
    const leaves = await deriveCommandLeaves();

    // `collectLeaves` used to drop every namespace node, which made the walk
    // unusable for documentation: there is no page for `vibe` if `vibe` is not
    // in the result. Namespaces are reachable now; the gate still classifies
    // leaves only.
    expect(nodes.some((node) => node.path === "vibe" && !node.isLeaf)).toBe(true);
    expect(nodes.filter((node) => node.isLeaf).map((node) => node.path)).toEqual(leaves);
    expect(nodes.length).toBeGreaterThan(leaves.length);
  });

  it("distinguishes a hidden command from a real one", async () => {
    const nodes = await deriveCommandNodes();
    const hidden = nodes.filter((node) => node.hidden).map((node) => node.path);

    // The 18 `upgrade` aliases are childless TOP-LEVEL commands, so a walk that
    // dropped `hidden` returned them as leaves indistinguishable from real
    // commands — and a docs generator consuming that list would have emitted 18
    // phantom pages, or deleted the alias table that is the only record of them.
    expect(hidden).toContain("update");
    expect(hidden).toContain("bump");
    expect(hidden.length).toBeGreaterThanOrEqual(18);
    expect(nodes.find((node) => node.path === "upgrade")?.hidden).toBe(false);
  });

  it("attributes hidden siblings to the module that registered them", async () => {
    const namespaces = await deriveCommandNamespaces();
    const upgrade = namespaces.find((namespace) => namespace.name === "upgrade");

    expect(upgrade?.sourcePath).toBe("packages/cli/src/commands/upgrade.ts");
    expect(upgrade?.registrar).toBe("registerUpgradeCommand");
    expect(upgrade?.hiddenSiblings.length).toBeGreaterThanOrEqual(18);

    // Attribution is refused, not guessed, when a module registers more than one
    // visible namespace. Empty today; a red here is a new shape to look at, not
    // a regression to silence.
    expect(await unattributedHiddenSiblings()).toEqual([]);
  });

  it("captures the addHelpText prose that helpInformation() drops", async () => {
    const namespaces = await deriveCommandNamespaces();
    const vibe = namespaces.find((namespace) => namespace.name === "vibe");

    // `vibe` registers its subcommand table through `addHelpText("after")`.
    // `helpInformation()` omits it; a capture of `outputHelp()` keeps it. This
    // assertion is the difference between the two, pinned — the Notes and
    // Examples blocks across the CLI live in exactly this channel and are the
    // highest-value prose on the surface.
    expect(vibe?.help).toContain("Subcommands:");
    expect(vibe?.help).toContain("feature-flagged");
  });

  it("reads aliases and .choices() through the accessors that hold the casts", async () => {
    const nodes = await deriveCommandNodes();

    const taskEval = nodes.find((node) => node.path === "task-eval");
    expect(taskEval?.aliases).toContain("eval");

    // `_hidden` and `argChoices` have no public getter in commander 13, so
    // reading them needs a cast. Both casts live in `command-universe.ts` and
    // nowhere else; a consumer re-declaring them owns a second thing to fix when
    // commander changes its internals.
    const withChoices = nodes.flatMap((node) =>
      node.options.filter((option) => option.choices !== undefined)
    );
    expect(withChoices.length).toBeGreaterThan(0);

    const deploymentType = nodes
      .find((node) => node.path === "deployment create")
      ?.options.find((option) => option.flags.includes("--type"));
    expect(deploymentType?.choices).toContain("WHATSAPP");
  });

  it("walks the tree exactly once, and projects everything else from it", async () => {
    const modules = await deriveCommandModules();
    const nodes = await deriveCommandNodes();

    // Every projection has to reduce to the same set of paths. Two walks over
    // one tree is how a docs page and a classification gate start disagreeing
    // about what the CLI contains.
    const fromModules = new Set(
      modules.flatMap((module) => module.roots.flatMap(flattenCommands)).map((node) => node.path)
    );
    expect(new Set(nodes.map((node) => node.path))).toEqual(fromModules);

    // Attribution is why registrars get their own throwaway program. It must not
    // change the tree: measured equal, 500 leaves both ways, empty diff.
    expect(nodes.filter((node) => node.isLeaf).length).toBe((await deriveCommandLeaves()).length);
  });

  it("keeps `help` lazy, so the classification gate never renders 582 help pages", async () => {
    // `deriveCommandLeaves()` reads `path` and `isLeaf` only. If `help` were
    // eager — or if a projection spread a node and evaluated the getter — the
    // gate would pay for text it never looks at. Guarding the property rather
    // than a millisecond budget: a timing assertion is flaky, this is not.
    const descriptor = Object.getOwnPropertyDescriptor((await deriveCommandNodes())[0], "help");
    expect(descriptor?.get).toBeTypeOf("function");
    expect(descriptor?.value).toBeUndefined();
  });
});
