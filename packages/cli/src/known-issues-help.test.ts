import type { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import { buildRootProgram } from "./index";
import { KNOWN_ISSUES_HELP_PREFIX, knownIssuesHelpLine } from "./known-issues-help";
import { routeIdOf } from "./util/route-id";

/**
 * THE GATE ON THE KNOWN-ISSUES HELP LINE.
 *
 * Two properties, and they fail in opposite directions:
 *
 *  1. EVERY command carries it, with ITS OWN route id. The line is installed by
 *     one tree walk precisely so no command can be forgotten, and an assertion
 *     over a hand-listed sample would not notice the walk stopping early.
 *  2. `--help` TOUCHES NO NETWORK. This is the property the whole design rests
 *     on — help is what a stuck user types, and it must answer offline, in CI,
 *     behind a proxy and inside a pipe. It is asserted with a `fetch` that
 *     throws, so a future edit that reaches for live data reds here rather than
 *     in somebody's airport terminal.
 *
 * ── READ HELP WITH `outputHelp`, NEVER `helpInformation` ─────────────────────
 *
 * `helpInformation()` renders the built-in sections and OMITS every
 * `addHelpText` block, so an assertion built on it would report this line as
 * absent from a tree that carries it perfectly — and, worse, would go on passing
 * a `not.toContain` assertion after the line was deleted. Output is captured
 * through `configureOutput` for that reason.
 */

/** The rendered help for one command, epilogues included. */
function helpTextOf(command: Command): string {
  let buffer = "";
  command.configureOutput({
    writeOut: (s) => {
      buffer += s;
    },
    writeErr: (s) => {
      buffer += s;
    }
  });
  command.outputHelp();
  return buffer;
}

function everyCommand(root: Command): Command[] {
  const out: Command[] = [root];
  for (const child of root.commands as Command[]) out.push(...everyCommand(child));
  return out;
}

function subcommand(root: Command, ...names: string[]): Command {
  let current = root;
  for (const name of names) {
    const next = (current.commands as Command[]).find((c) => c.name() === name);
    if (next === undefined) throw new Error(`no such command: ${names.join(" ")}`);
    current = next;
  }
  return current;
}

/**
 * The server's own constraint on a route id, from
 * `packages/types/src/api/public/v1/schemas/known-issues.schemas.ts`.
 *
 * Copied rather than imported because `@nexus/types` is a devDependency here —
 * this CLI is published standalone and its runtime cannot reach that package.
 * The copy is load-bearing in one direction only: it proves every id this help
 * prints is one the server will ACCEPT. A drift would make it stricter or looser
 * than the server, which the control below is what makes visible.
 */
const SERVER_ROUTE_PATTERN = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$/;

describe("the known-issues help line", () => {
  const program = buildRootProgram("9.9.9");
  const commands = everyCommand(program);
  const reporter = subcommand(program, "known-issues");

  /**
   * THE CONTROL. Every assertion below iterates the real command tree, and a
   * tree that silently became empty — or a walk that stopped at the first
   * namespace — passes all of them.
   */
  it("CONTROL: the real program carries a large command tree", () => {
    expect(commands.length).toBeGreaterThan(500);
    expect(commands.filter((c) => c.parent !== null && c.parent !== undefined).length).toBe(
      commands.length - 1
    );
  });

  it("puts the line on every command, carrying that command's own route id", () => {
    const missing: string[] = [];
    const wrong: string[] = [];

    for (const command of commands) {
      if (command === program || command === reporter) continue;

      const help = helpTextOf(command);
      const expected = knownIssuesHelpLine(routeIdOf(command)).trim();

      if (!help.includes(KNOWN_ISSUES_HELP_PREFIX)) missing.push(routeIdOf(command));
      else if (!help.includes(expected)) wrong.push(routeIdOf(command));
    }

    expect(missing, "commands whose --help never names known-issues").toEqual([]);
    expect(wrong, "commands whose line names a route id that is not their own").toEqual([]);
  });

  /**
   * `routeIdOf(program)` is the empty string, so a line built from the root
   * would read `nexus known-issues ` with nothing after it — an instruction the
   * server answers with a 400.
   */
  it("omits the root, whose route id is empty and would print a broken instruction", () => {
    expect(routeIdOf(program)).toBe("");
    expect(helpTextOf(program)).not.toContain(KNOWN_ISSUES_HELP_PREFIX);
  });

  it("omits known-issues itself rather than telling a reader to run it on itself", () => {
    expect(helpTextOf(reporter)).not.toContain(KNOWN_ISSUES_HELP_PREFIX);
  });

  /**
   * The point of the line is that it can be COPIED and run. An id the server
   * refuses would make every help screen carry an instruction that 400s.
   */
  it("prints only route ids the server's own pattern accepts", () => {
    // The pattern must be able to refuse, or a clean sweep proves nothing.
    expect(SERVER_ROUTE_PATTERN.test("Workflow.Node.Test")).toBe(false);
    expect(SERVER_ROUTE_PATTERN.test("")).toBe(false);

    const refused = commands
      .filter((c) => c !== program && c !== reporter)
      .map((c) => routeIdOf(c))
      .filter((id) => !SERVER_ROUTE_PATTERN.test(id));

    expect(refused, "route ids this help prints that the server would reject").toEqual([]);
  });

  /**
   * 🚨 THE PROPERTY THE WHOLE DESIGN EXISTS FOR.
   *
   * A help screen that fetches is a help screen that hangs when the network is
   * gone — which is exactly when somebody is reading it. The line is static
   * text and the live data lives behind the command it names.
   */
  it("renders every help screen without touching the network", () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("--help must not touch the network");
    });
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    try {
      for (const command of commands) helpTextOf(command);
    } finally {
      globalThis.fetch = original;
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /**
   * POSITION. `help-scope.ts` registers the "THIS IS ONE CLIENT" caveat as an
   * `afterAll` on the root, and its header states that sitting below the
   * command's own claims is the point of it. This line uses `"after"`, which
   * lands above that footer — so the per-command pointer reads with the command
   * and the global caveat stays last.
   */
  it("sits above the scope footer rather than competing for the last slot", () => {
    const help = helpTextOf(subcommand(program, "agent", "list"));
    const line = help.indexOf(KNOWN_ISSUES_HELP_PREFIX);
    const footer = help.indexOf("THIS IS ONE CLIENT");

    expect(line).toBeGreaterThan(-1);
    expect(footer).toBeGreaterThan(-1);
    expect(line).toBeLessThan(footer);
  });

  it("names an alias's canonical route, so one command is not two lists", () => {
    const update = subcommand(program, "skills", "update");

    expect(update.aliases()).toContain("install");
    expect(helpTextOf(update)).toContain(knownIssuesHelpLine("skills.update").trim());
  });
});
