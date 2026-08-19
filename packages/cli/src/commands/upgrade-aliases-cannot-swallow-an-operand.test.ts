import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { isHiddenCommand } from "../command-universe";
import { buildRootProgram } from "../index";
import { UPGRADE_ALIASES } from "./upgrade";

/**
 * An alternative spelling of `upgrade` must never turn an operand into a
 * global reinstall, and must never be a word this CLI uses for something else.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS FILE ONCE RECORDED THE COLLISIONS INSTEAD OF FORBIDDING THEM.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `get`, `update`, `install`, `pull` and `download` were all hidden top-level
 * commands that reinstalled the binary, and this spec held them in a list named
 * `ALIASES_THAT_ARE_ALSO_VERBS` — measured, deliberately not forbidden, because
 * removing a shipped alias was a product call. That call has been made: fifteen
 * of the eighteen are gone and the three that remain are `.alias()` calls on
 * `upgrade`.
 *
 * So the part of that measurement which HAS teeth becomes a gate, and the part
 * that does not stays a measurement.
 *
 *   GATED — a spelling may not be a word another command in this tree answers
 *   to as an `.alias()`. `install` and `sync` were exactly that: `skills update`
 *   answers to both, so one word meant "install the skills bundle" in one place
 *   and "replace the binary" in another. The CLI created that ambiguity itself
 *   and it is the class worth making unrepresentable. A collision with a
 *   top-level NAME is gated for the same reason, one step harder: it would make
 *   one of the two unreachable.
 *
 *   MEASURED — a spelling that also ends a leaf DEEPER in the tree. `update`
 *   ends 29 of them, and it stays, because none of those 29 is reachable
 *   without a noun in front of it: `nexus agent update` is a different
 *   invocation, not a second meaning of `nexus update`. The list is asserted so
 *   that it changes visibly, not so that it is empty.
 *
 * ── WHAT THE OPERAND CASE DEFENDS, AND WHY IT IS NOT REDUNDANT ───────────────
 *
 * `nexus update abc-123` is what somebody types when they meant `nexus agent
 * update abc-123`. They must get an unknown-command error. If the spelling
 * accepted the excess operand they would get a global package-manager install
 * instead, and `index.ts` documents why that is not a harmless surprise: the
 * updater replaces the directory the running binary lives in, from inside that
 * binary, and a half-applied update leaves the global shim pointing at a pnpm
 * hash directory that no longer exists, after which NOTHING in this package
 * runs.
 *
 * That refusal is correct BY LIBRARY DEFAULT, not by anything this repository
 * states. commander flipped `_allowExcessArguments` to `false` by default, so
 * `upgrade` registers zero arguments and rejects the operand before the action
 * runs. Nothing in this package asks for that, so one
 * `.allowExcessArguments(true)` on the root or on `upgrade`, or a commander
 * downgrade, re-opens it silently with no other test going red.
 */

/** Every leaf command path in the tree, as word arrays. */
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
const upgrade = (program.commands as Command[]).find((c) => c.name() === "upgrade");

/**
 * Every word some OTHER command answers to as a declared alias. `skills update`
 * answers to `install` and `sync`, and both were hidden reinstall commands
 * until this change.
 */
const aliasesOfOtherCommands = new Set(
  allCommands(program)
    .filter(([path]) => path !== "upgrade")
    .flatMap(([, cmd]) => cmd.aliases())
);

/** The last word of every leaf — the verbs this CLI uses. */
const leafVerbs = new Set(leafPaths(program).map((p) => p[p.length - 1]));

/**
 * Spellings that are ALSO a verb deeper in the tree. Measured, not forbidden —
 * see the header. `update` is the whole list, and shrinking it to nothing would
 * cost the one synonym the published docs instruct people to type.
 */
const SPELLINGS_THAT_ARE_ALSO_A_DEEP_VERB = ["update"];

describe("the alternative spellings of nexus upgrade", () => {
  it("are declared on the upgrade command, not registered as separate commands", () => {
    expect(upgrade).toBeDefined();
    expect([...(upgrade?.aliases() ?? [])].sort()).toEqual([...UPGRADE_ALIASES].sort());

    // Control: the roster is real. An empty one makes every case below vacuous.
    expect(UPGRADE_ALIASES.length).toBeGreaterThan(0);
  });

  /**
   * 🚨 THE ASSERTION BELOW IS AN EMPTY SET, SO IT NEEDS TWO CONTROLS OR IT IS
   *    A TEST THAT CANNOT FAIL.
   *
   * Eighteen hidden top-level reinstalls used to live here, and the honest
   * statement after removing them is "there are none". That statement is also
   * what a broken walk returns, and what a broken hidden-DETECTOR returns, and
   * neither would go red. So both are established first, in this file rather
   * than by leaning on a control in another one — a gate whose control lives
   * elsewhere can be deleted without the gate noticing.
   *
   * The read itself is `isHiddenCommand`, not `_hidden`. `command-universe.ts`
   * documents why: `_hidden` is private and undeclared, so an upstream rename
   * yields `undefined`, `undefined === true` is `false`, and every hidden
   * command reports itself VISIBLE — the failure lands in the direction that
   * makes this assertion pass.
   */
  it("the hidden-command detector still detects one", () => {
    const scratch = new Command();
    const concealed = scratch.command("concealed", { hidden: true });
    const shown = scratch.command("shown");

    expect(isHiddenCommand(concealed)).toBe(true);
    expect(isHiddenCommand(shown)).toBe(false);
  });

  it("leave NO hidden command anywhere in the tree", () => {
    const walked = allCommands(program);

    // Control: the walk really enumerated the CLI. An empty walk satisfies the
    // assertion below while reading nothing at all.
    expect(walked.length).toBeGreaterThan(100);

    // A hidden command is absent from every `--help`, so nothing warns a user
    // it exists. Adding one back is a decision that has to be argued, not a
    // diff nobody notices.
    expect(walked.filter(([, c]) => isHiddenCommand(c)).map(([path]) => path)).toEqual([]);
  });

  it.each([...UPGRADE_ALIASES, "upgrade"])(
    "`nexus %s <anything>` cannot reach the installer",
    (name) => {
      const cmd = (program.commands as Command[]).find(
        (c) => c.name() === name || c.aliases().includes(name)
      );
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

  it("never reuse a word another command already answers to", () => {
    // Control: the alias walk really ran. `skills update` declares both of
    // these, and a miss here means the walk broke rather than the CLI having
    // stopped declaring aliases.
    expect(aliasesOfOtherCommands.has("install")).toBe(true);
    expect(aliasesOfOtherCommands.has("sync")).toBe(true);

    const colliding = [...UPGRADE_ALIASES].filter((a) => aliasesOfOtherCommands.has(a)).sort();
    expect(colliding).toEqual([]);
  });

  it("records exactly which spellings are also a verb deeper in the tree", () => {
    // Control: `get` ends 40 leaves. A miss means the leaf walk broke, not that
    // the CLI stopped having verbs.
    expect(leafVerbs.has("get")).toBe(true);

    const deep = [...UPGRADE_ALIASES].filter((a) => leafVerbs.has(a)).sort();
    expect(deep).toEqual(SPELLINGS_THAT_ARE_ALSO_A_DEEP_VERB);
  });

  it("no spelling shadows a whole NAMESPACE, which would be an unreachable command", () => {
    // A namespace and a root alias with the same name are two ways to name one
    // root; commander resolves the first registered and the other is dead.
    const namespaces = allCommands(program)
      .filter(([path]) => !path.includes(" ") && path !== "upgrade")
      .map(([path]) => path);

    expect(namespaces.length).toBeGreaterThan(0);
    for (const alias of UPGRADE_ALIASES) {
      expect(namespaces).not.toContain(alias);
    }
  });
});
