import { readdirSync } from "node:fs";
import { join } from "node:path";

import { Command } from "commander";

import { type DeferredRequirement, findDeferredRequirements } from "./body-satisfies-required";

/**
 * THE POPULATION `applyBodySatisfiesRequired` ACTS ON, OBSERVABLE.
 *
 * `buildRootProgram()` applies the seam as its last act, so the tree it returns
 * has an EMPTY deferred population by construction. That is the right assertion
 * for "did the fix land" and a useless one for "was there anything to fix" — and
 * a spec that measures the real root and finds nothing is indistinguishable from
 * a spec whose detector broke.
 *
 * So the population is observed one step earlier, from the same registrars, and
 * every consumer reads it from HERE. Two specs each carrying their own copy of
 * this rebuild is two things to drift, and the drift is silent: the copy that
 * goes stale keeps passing over a population that has quietly shrunk.
 */
const COMMANDS_DIR = join(__dirname, "../commands");

/**
 * Rebuild the real tree WITHOUT the fix applied.
 *
 * Two-argument registrars (`registerWorkflowBuilderCommands(workflow, program)`,
 * the `admin apps` family) are deliberately excluded: they are reached through
 * their parent registrar, so calling them again at the root would graft phantom
 * top-level commands onto the tree. Excluding them is not a gap — it is how the
 * real tree is shaped. `body-satisfies-required.test.ts` asserts in BOTH
 * directions that the one-argument set here equals the set `index.ts` wires, so
 * "the same tree" is a checked claim rather than a comment.
 */
export async function rebuildTreeWithoutTheFix(): Promise<Command> {
  const program = new Command().name("nexus");
  const files = readdirSync(COMMANDS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".conformance.ts"))
    .sort();
  for (const file of files) {
    const mod = (await import(join(COMMANDS_DIR, file))) as Record<string, unknown>;
    for (const [name, value] of Object.entries(mod)) {
      if (name.startsWith("register") && typeof value === "function" && value.length === 1) {
        (value as (p: Command) => void)(program);
      }
    }
  }
  return program;
}

/** Every command whose required flags this seam defers, before it defers them. */
export async function deferredPopulation(): Promise<DeferredRequirement[]> {
  return findDeferredRequirements(await rebuildTreeWithoutTheFix());
}

/** `access-card create` → "access-card create". The root's own name is dropped. */
export function commandPath(command: Command): string {
  const parts: string[] = [];
  let node: Command | null = command;
  while (node?.parent) {
    parts.unshift(node.name());
    node = node.parent;
  }
  return parts.join(" ");
}

/**
 * Importing ~90 command modules through the vitest transform takes seconds, and
 * more than that when the rest of the suite is running in parallel. The default
 * 5s timeout turns that into a RED that reads exactly like a real failure — it
 * did, in a full-suite run, on three separate files that all derive the tree.
 */
export const TREE_TIMEOUT_MS = 60_000;

/**
 * FLOORS, NOT EXPECTATIONS. Both sit comfortably below what the tree holds
 * today and far above zero, so they catch a population that has COLLAPSED —
 * a registrar that stops being discovered, a body-flag predicate that stops
 * matching — without going red every time somebody adds or removes a command.
 *
 * A gate looping over an empty population is green and proves nothing, and
 * `toBeGreaterThan(0)` is barely better: it survives a collapse from dozens to
 * one. These are the numbers to raise if the tree grows a lot; they are never
 * the numbers to lower to make a red go away.
 */
export const MINIMUM_DEFERRED_COMMANDS = 30;
export const MINIMUM_DEFERRED_OPTIONS = 50;
