import type { Command } from "commander";
import { describe, expect, it } from "vitest";

import { buildRootProgram } from "../index";
import { UPGRADE_ALIASES } from "./upgrade";

/**
 * A hidden upgrade alias must never turn an operand into a global reinstall.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `get` AND `update` ARE HIDDEN TOP-LEVEL ALIASES FOR `upgrade`, AND THEY ARE
 *    ALSO THE TWO MOST COMMON VERBS IN THIS CLI.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus get abc-123` is what a user types when they meant `nexus agent get
 * abc-123`. They expect an unknown-command error. If the alias accepted the
 * excess operand, they would get a global package-manager install instead — and
 * `index.ts` documents why that is not a harmless surprise: the updater replaces
 * the directory the running binary lives in, from inside that binary, and a
 * half-applied update leaves the global shim pointing at a pnpm hash directory
 * that no longer exists, after which NOTHING in this package runs.
 *
 * ── WHY THIS FILE EXISTS WHEN THE BEHAVIOUR IS ALREADY CORRECT ────────────────
 *
 * It is correct BY LIBRARY DEFAULT, not by anything this repository states.
 * commander flipped `_allowExcessArguments` to `false` by default, so the alias
 * registers zero arguments and rejects the operand before the action runs
 * (`commander.excessArguments`). Nothing in this package asks for that, so:
 *
 *   - one `.allowExcessArguments(true)` anywhere on the root or an alias
 *     re-opens it silently, and
 *   - a commander downgrade re-opens it silently, with no test going red.
 *
 * A safety property that holds only because of an unstated dependency default is
 * a property nobody is defending. This file defends it.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT ASSERT ───────────────────────────────
 *
 * That a BARE `nexus get` is refused. It is not: with no operand the alias runs
 * the upgrade, which is the whole point of `nexus latest` / `nexus up`. Whether
 * the verb-colliding aliases should keep their bare form is a product call about
 * shipped behaviour, recorded in {@link ALIASES_THAT_ARE_ALSO_VERBS} rather than
 * decided here.
 */

/** Every leaf command path in the tree, as space-joined words. */
function leafPaths(cmd: Command, prefix: string[] = []): string[][] {
  const here = prefix.length === 0 ? [] : prefix;
  const children = cmd.commands as Command[];
  if (children.length === 0) return here.length > 0 ? [here] : [];
  return children.flatMap((c) => leafPaths(c, [...here, c.name()]));
}

/** Every command object in the tree, keyed by its space-joined path. */
function allCommands(cmd: Command, prefix: string[] = []): Array<[string, Command]> {
  const children = cmd.commands as Command[];
  return children.flatMap((c) => {
    const path = [...prefix, c.name()];
    return [[path.join(" "), c] as [string, Command], ...allCommands(c, path)];
  });
}

const program = buildRootProgram();
const aliasSet = new Set(UPGRADE_ALIASES);

/**
 * The last word of every leaf that is NOT one of these aliases — i.e. the verbs
 * a user could be reaching for when they type an alias by itself.
 */
const realVerbs = new Set(
  leafPaths(program)
    .filter((p) => !(p.length === 1 && aliasSet.has(p[0])))
    .map((p) => p[p.length - 1])
);

/**
 * Hidden aliases that are ALSO a verb somewhere in this CLI.
 *
 * Recorded, not forbidden — removing a shipped alias is a behaviour change and
 * belongs to whoever owns the CLI's surface. The value is that the list is
 * MEASURED: a new alias that collides shows up here as a diff instead of as a
 * user reinstalling their CLI by accident.
 *
 * `download`, `install` and `pull` carry no upgrade meaning at all and are the
 * cheapest to drop. `get` and `update` are the two with real collision volume.
 */
const ALIASES_THAT_ARE_ALSO_VERBS = ["download", "get", "install", "pull", "update"];

describe("hidden upgrade aliases", () => {
  it("registers every alias in UPGRADE_ALIASES, and only those, as a hidden root command", () => {
    const hiddenRoots = (program.commands as Command[])
      .filter((c) => Boolean((c as unknown as { _hidden?: boolean })._hidden))
      .map((c) => c.name())
      .sort();

    // Control: the tree is real. An empty roster would make every assertion
    // below vacuously true.
    expect(hiddenRoots.length).toBeGreaterThan(0);
    expect(hiddenRoots).toEqual([...UPGRADE_ALIASES].sort());
  });

  it.each([...UPGRADE_ALIASES, "upgrade"])(
    "`nexus %s <anything>` cannot reach the installer",
    (name) => {
      const cmd = (program.commands as Command[]).find((c) => c.name() === name);
      expect(cmd).toBeDefined();

      // Two independent facts, and BOTH are required. Zero declared arguments
      // means any operand is "excess"; refusing excess means the parser errors
      // before the action handler is entered.
      expect(cmd?.registeredArguments).toHaveLength(0);
      expect((cmd as unknown as { _allowExcessArguments: boolean })._allowExcessArguments).toBe(
        false
      );
    }
  );

  it("does not let the ROOT re-open excess arguments for everything under it", () => {
    expect((program as unknown as { _allowExcessArguments: boolean })._allowExcessArguments).toBe(
      false
    );
  });

  it("records exactly which aliases shadow a real verb", () => {
    const colliding = [...UPGRADE_ALIASES].filter((a) => realVerbs.has(a)).sort();

    // Control: `get` is a verb on dozens of leaves. A miss here means the tree
    // walk broke, not that the CLI stopped having verbs.
    expect(realVerbs.has("get")).toBe(true);
    expect(colliding).toEqual(ALIASES_THAT_ARE_ALSO_VERBS);
  });

  it("no alias shadows a whole NAMESPACE, which would be an unreachable command", () => {
    // A namespace and an alias with the same name are two root commands with one
    // name; commander resolves the first registered and the other is dead. This
    // has never happened and is cheap to keep impossible.
    const namespaces = allCommands(program)
      .filter(([path]) => !path.includes(" "))
      .map(([path]) => path)
      .filter((n) => !aliasSet.has(n));

    expect(namespaces.length).toBeGreaterThan(0);
    for (const alias of UPGRADE_ALIASES) {
      expect(namespaces).not.toContain(alias);
    }
  });
});
