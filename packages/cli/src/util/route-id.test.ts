import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Command } from "commander";
import { beforeAll, describe, expect, it } from "vitest";

import { allRouteIds, routeIdOf } from "./route-id";

/**
 * THE ROUTE ID IS THE KEY THE WHOLE known-issues SURFACE HANGS ON, so this file
 * asserts the two properties that make it usable as a key, over the REAL
 * program rather than over a fixture.
 *
 * 1. INJECTIVE — no two commands derive the same id. A collision would merge
 *    two commands' known issues into one list, silently.
 * 2. ALIAS-STABLE — every declared `.alias()` derives its command's CANONICAL
 *    id. Otherwise `nexus skills install` and `nexus skills sync` would each be
 *    their own route and neither would carry `skills update`'s known issues.
 *
 * ── WHY THE PROGRAM IS REBUILT FROM `index.ts` AS TEXT ────────────────────────
 *
 * `src/index.ts` builds the tree AND parses `process.argv` at module scope, so
 * importing it RUNS the CLI: with no arguments it prints help and exits, which
 * takes the test process with it. The registrars are therefore read out of that
 * file as TEXT and imported one by one — the same idiom five other files in this
 * package already use to derive facts from `index.ts`.
 *
 * A hand-copied registrar list is the alternative and it is the wrong one: it
 * would drift the moment a namespace lands, and it would drift SILENTLY — the
 * suite would still pass, over a population missing the new namespace. Reading
 * the declaration means a new namespace joins this assertion by itself.
 */

/** Every `register*Commands` export `index.ts` actually wires into the tree. */
function declaredRegistrars(): { symbol: string; module: string }[] {
  const source = readFileSync(join(__dirname, "..", "index.ts"), "utf8");
  const pattern = /import \{ (register\w+)(?:,[^}]*)? \} from "(\.\/commands\/[a-z-]+)"/g;

  const seen = new Set<string>();
  const found: { symbol: string; module: string }[] = [];
  for (const match of source.matchAll(pattern)) {
    const [, symbol, module] = match;
    // `index.ts` may import one registrar under two statements; commander
    // throws on a duplicate command name, so register each exactly once.
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    found.push({ symbol, module });
  }
  return found;
}

let program: Command;
let registrarCount = 0;

beforeAll(async () => {
  program = new Command().name("nexus");
  const registrars = declaredRegistrars();
  registrarCount = registrars.length;

  for (const { symbol, module } of registrars) {
    // The specifier is written relative to `src/index.ts`; this file is one
    // directory deeper, so it is re-rooted rather than used verbatim.
    const specifier = module.replace(/^\.\//, "../");
    const loaded = (await import(specifier)) as Record<string, (p: Command) => void>;
    loaded[symbol](program);
  }
});

describe("the population this file asserts over", () => {
  /**
   * THE CONTROL. Every assertion below is over a set derived at runtime, and a
   * derivation that silently yields nothing passes every one of them. These
   * bounds are deliberately loose — they exist to separate "the tree was built"
   * from "the regex matched nothing", not to pin a count that moves weekly.
   */
  it("really built the program", () => {
    expect(registrarCount).toBeGreaterThan(30);
    expect(program.commands.length).toBeGreaterThan(30);
    expect(allRouteIds(program).length).toBeGreaterThan(300);
  });
});

describe("routeIdOf", () => {
  it("is injective across the whole program", () => {
    const ids = allRouteIds(program);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });

  it("omits the root program's own name", () => {
    const ids = allRouteIds(program);
    expect(ids.every((id) => !id.startsWith("nexus."))).toBe(true);
  });

  it("derives a dotted path from the parent chain", () => {
    const agent = program.commands.find((c) => c.name() === "agent");
    expect(agent).toBeDefined();
    expect(routeIdOf(agent as Command)).toBe("agent");

    const list = (agent as Command).commands.find((c) => c.name() === "list");
    expect(list).toBeDefined();
    expect(routeIdOf(list as Command)).toBe("agent.list");
  });
});

describe("alias stability", () => {
  /**
   * Collected from the tree, so a new alias enters this assertion with no edit
   * here. An alias is a SPELLING of a command, never a command of its own.
   */
  function aliasedCommands(): { command: Command; aliases: string[] }[] {
    const found: { command: Command; aliases: string[] }[] = [];
    const visit = (command: Command): void => {
      if (command.parent && command.aliases().length > 0) {
        found.push({ command, aliases: command.aliases() });
      }
      for (const child of command.commands as Command[]) visit(child);
    };
    visit(program);
    return found;
  }

  it("finds aliases to assert over", () => {
    // Anti-vacuity: an alias sweep that finds none passes the next test for
    // free and would keep passing after the property broke.
    expect(aliasedCommands().length).toBeGreaterThan(0);
  });

  it("never puts an alias spelling into a derived id", () => {
    // ⚠️ THIS ASSERTION WAS A TAUTOLOGY ON ITS FIRST WRITING — it compared
    // `routeIdOf(command)` against a `canonical` computed by the same call, so
    // it held for every possible implementation. The mutation battery caught
    // it: preferring the alias inside `routeIdOf` left it GREEN. The property
    // that actually has content is about the id's LAST SEGMENT.
    for (const { command, aliases } of aliasedCommands()) {
      // Not `.at(-1)`: this package compiles against `lib: ES2020`, where that
      // method does not exist. vitest transpiles it happily and only `tsc`
      // objects, so the green suite is not the check that matters here.
      const segments = routeIdOf(command).split(".");
      const lastSegment = segments[segments.length - 1];
      expect(lastSegment).toBe(command.name());
      expect(aliases).not.toContain(lastSegment);
    }
  });

  it("derives the canonical id from a REAL invocation through an alias", async () => {
    // Reading `.name()` off a command the test picked proves the getter. It
    // does NOT prove that typing the alias reaches that same object — only
    // driving argv through commander's own resolution does, and that is the
    // step the whole property rests on.
    const observed: string[] = [];

    const harness = new Command().name("nexus").exitOverride();
    harness.hook("preAction", (_root, actionCommand) => {
      observed.push(routeIdOf(actionCommand));
      throw new Error("__STOP_BEFORE_ACTION__");
    });

    const parent = harness.command("thing");
    parent
      .command("update")
      .alias("install")
      .alias("sync")
      .action(() => {
        throw new Error("the preAction hook must run first");
      });

    for (const spelling of ["update", "install", "sync"]) {
      try {
        harness.parse(["node", "nexus", "thing", spelling]);
      } catch (error) {
        if ((error as Error).message !== "__STOP_BEFORE_ACTION__") throw error;
      }
    }

    expect(observed).toEqual(["thing.update", "thing.update", "thing.update"]);
  });
});
