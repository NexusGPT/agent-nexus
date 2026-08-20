import type { Command } from "commander";

/**
 * RESOLVE A SPACE-JOINED PATH THE WAY THE BINARY DOES — ALIASES INCLUDED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY NOT A LOOKUP IN THE MANIFEST
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `cli-surface.generated.ts` is keyed by a leaf's CANONICAL path, so a lookup in
 * it answers "is this the name the tree uses today". That is a different
 * question from the one both callers actually have, which is **"does the line a
 * user typed last release still work"** — and the two answers diverge on exactly
 * the case `COMPATIBILITY.md` calls the correct way to rename something:
 *
 *   > `task-eval` is the one top-level command with an alias: `eval`. It was
 *   > renamed and the old name still resolves. That is the shape a rename takes
 *   > here — the old spelling keeps working.
 *
 * A manifest lookup for `eval run` finds nothing, because the row is filed under
 * `task-eval run`. Answering "removed" there would make this mechanism refuse
 * the one rename the contract sanctions, and a gate that refuses correct work
 * gets uninstalled.
 *
 * So the resolution asks COMMANDER, segment by segment, exactly as the parser
 * does: a child matches when its name matches OR one of its aliases does.
 *
 * ⚠️ `aliases()` is public on commander's `Command` and is read as declared, with
 * no cast. A cast would compile identically today and, on an upstream rename,
 * yield `undefined` — every alias would silently stop resolving, every aliased
 * rename would report as a removal, and no compiler error anywhere.
 */
export function resolveCommandPath(program: Command, path: string): Command | undefined {
  let node: Command = program;

  for (const segment of path.split(" ")) {
    const child: Command | undefined = (node.commands as Command[]).find(
      (candidate) => candidate.name() === segment || candidate.aliases().includes(segment)
    );
    if (child === undefined) return undefined;
    node = child;
  }

  return node;
}

/**
 * Does the old line still RUN something, rather than merely still parse?
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A PATH THAT RESOLVES IS NOT A PATH THAT WORKS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 🚨 {@link resolveCommandPath} ANSWERS "IS THERE A COMMANDER NODE HERE", AND A
 * REMOVAL GATE THAT ASKS ONLY THAT HAS A HOLE THE SIZE OF A NAMESPACE. Turn
 * `nexus access-card delete <id>` into a namespace with `access-card delete card`
 * and `access-card delete all` under it, and `access-card delete` still resolves
 * — to a node that prints a help screen instead of deleting anything. Typing the
 * old line stops working, and a gate reading the resolution alone calls that the
 * SANCTIONED RENAME and asks for no cycle.
 *
 * So the gate asks this instead: the path resolves AND the node it resolves to is
 * still an invocable LEAF. The leaf test is `command-universe.ts`'s own —
 * `children.filter(name !== "help").length === 0` — because two definitions of
 * "leaf" in one package is how the manifest and its gate start disagreeing.
 *
 * ── WHAT THIS REFUSES THAT IS ARGUABLY FINE, AND WHY THAT IS THE RIGHT ERROR ──
 *
 * A command that is invocable AND a namespace — `nexus docs` is the only one —
 * fails this test while still working. That shape is excluded from the leaf
 * population by construction, so no such path is ever in the baseline and the
 * case cannot arise from today's tree. It CAN arise by a leaf gaining a
 * subcommand while keeping its own action, and this reports that as gone.
 *
 * That is the conservative direction and it is chosen deliberately: refusing a
 * change that still works costs its author one argument, and it is visible.
 * Permitting one that stopped working costs every script that used it, silently,
 * which is the whole failure this file exists inside.
 */
export function resolvesToInvocableLeaf(program: Command, path: string): boolean {
  const command = resolveCommandPath(program, path);
  if (command === undefined) return false;
  return (command.commands as Command[]).every((child) => child.name() === "help");
}
