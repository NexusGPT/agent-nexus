import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import { captureHelp, type CommandNode, deriveCommandNodes } from "./command-universe";
import { buildDocNamespaces } from "./docs-page.model";
import { HELP_SCOPE_HEADING } from "./help-scope";
import { KNOWN_ISSUES_HELP_PREFIX } from "./known-issues-help";
import { buildRootProgram, VERSION } from "./root-program";

/**
 * EVERY FENCE ON A GENERATED DOCS PAGE IS THE HELP THE BINARY ACTUALLY PRINTS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT WENT WRONG
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Each generated page renders a fenced block that reads as `nexus <cmd> --help`
 * output. It was not that output. `deriveCommandModules()` runs each registrar
 * against its OWN throwaway `new Command()` for attribution, and the node's help
 * was captured from that throwaway — while `index.ts` installs two help blocks
 * on the FINISHED tree, after every registrar has run:
 *
 *   - `applyKnownIssuesHelpLine(program)` — the `Known issues on this route`
 *     pointer, which is the only place a reader is told the route has any.
 *   - `registerHelpScopeFooter(program, version)` — `THIS IS ONE CLIENT …, NOT
 *     THE PLATFORM` and the four lines under it, which is what stops a reader
 *     recording a capability as absent from the platform because this client at
 *     this version has no verb for it.
 *
 * A throwaway program cannot carry either by construction. Measured before the
 * fix: 565 of 565 documented paths differed from the real `--help`, and the
 * difference was those two blocks EVERY time — the projection was a strict
 * subset, never once carrying a line the real screen omits.
 *
 * ── WHY NOTHING CAUGHT IT ────────────────────────────────────────────────────
 *
 * A docblock in `command-universe.ts` certified the surface: *"Verified equal to
 * a single shared program: 500 leaves either way, empty diff in both
 * directions."* That measurement was true and it compared command PATHS. Paths
 * were the one axis that never diverged; content differed on every node. A
 * verification can be honest, reproducible, and about the wrong axis — so this
 * gate compares BYTES, and the assertion below is the axis in the name.
 *
 * ── WHY IT SWEEPS, AND WHY IT COUNTS ─────────────────────────────────────────
 *
 * The population is the docs model itself, so a namespace added tomorrow is
 * covered without being named here. That makes the gate vacuous in exactly one
 * way — a model that documents NOTHING passes a loop over nothing — so the floor
 * below is not decoration. Measured at the time of writing: 47 namespaces, 518
 * subcommands, 565 documented paths.
 *
 * ── 🔴 WHY BYTE-IDENTITY IS NOT ENOUGH, PROVEN BY MUTATION ───────────────────
 *
 * The identity assertion compares the model against the root program, and the
 * model is now CAPTURED from the root program. So a root decoration deleted
 * from `buildRootProgram` disappears from both sides at once and the two stay
 * byte-identical. Measured: deleting `applyKnownIssuesHelpLine(program)` from
 * `index.ts` leaves the identity assertion GREEN. Identity protects the wiring —
 * it reds the moment a node's help is captured from a throwaway program again,
 * which is the defect above — and it is structurally blind to the blocks going
 * missing from the real screen.
 *
 * That is what the second assertion is for, and why its expectation is a
 * CONTENT floor rather than a comparison: the two blocks must be present in the
 * text a docs page publishes. Both constants are imported from the modules that
 * install them, never re-typed here, so rewording either line into uselessness
 * cannot leave this green.
 *
 * `help-scope.test.ts` and `known-issues-help.test.ts` already assert both blocks
 * reach every command of the PROGRAM. Neither said anything about the docs
 * pages, and the pages carried neither block on any of 565 paths while both of
 * those suites were green — asserting the same fact one layer further out is the
 * point, not a duplicate.
 */

const DOCUMENTED_PATHS_FLOOR = 500;
const NAMESPACES_FLOOR = 40;

/** Every command the shipped binary parses with, keyed by space-joined path. */
function realRootProgram(): ReadonlyMap<string, Command> {
  const index = new Map<string, Command>();

  const visit = (command: Command, prefix: readonly string[]): void => {
    const path = [...prefix, command.name()];
    index.set(path.join(" "), command);
    for (const child of command.commands) {
      if (child.name() !== "help") visit(child, path);
    }
  };

  for (const root of buildRootProgram(VERSION).commands) {
    if (root.name() !== "help") visit(root, []);
  }

  return index;
}

interface DocumentedHelp {
  readonly path: string;
  readonly help: string;
}

/** Every path a generated page publishes a help fence for, namespaces included. */
async function documentedHelp(): Promise<DocumentedHelp[]> {
  const namespaces = await buildDocNamespaces();

  // Anti-vacuity, at the source rather than in one caller: every assertion below
  // is a filter over this list, and a filter over nothing is green.
  expect(namespaces.length).toBeGreaterThanOrEqual(NAMESPACES_FLOOR);

  const documented = namespaces.flatMap((namespace) => [
    { path: namespace.name, help: namespace.help },
    ...namespace.commands.map((command) => ({ path: command.path, help: command.help }))
  ]);

  expect(documented.length).toBeGreaterThanOrEqual(DOCUMENTED_PATHS_FLOOR);
  return documented;
}

/**
 * A line-level report, never a boolean.
 *
 * `expect(a).toBe(b)` on two 60-line help screens prints two walls of text and
 * leaves the reader to spot the difference. The whole value of this gate on the
 * day it goes red is that it says WHICH lines and WHICH path.
 */
function describeHelpDifference(path: string, expected: string, actual: string): string {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const expectedSet = new Set(expectedLines);
  const actualSet = new Set(actualLines);

  const missing = expectedLines.filter((line) => !actualSet.has(line));
  const extra = actualLines.filter((line) => !expectedSet.has(line));
  const firstDiff = expectedLines.findIndex((line, index) => actualLines[index] !== line);

  return [
    `\`nexus ${path} --help\` is NOT what the docs model documents.`,
    `  first differing line: ${firstDiff === -1 ? "(none — length differs)" : String(firstDiff + 1)}`,
    `  real --help has ${expectedLines.length} lines, the model has ${actualLines.length}`,
    ...missing.map((line) => `  ONLY IN THE REAL --help: ${JSON.stringify(line)}`),
    ...extra.map((line) => `  ONLY IN THE MODEL: ${JSON.stringify(line)}`)
  ].join("\n");
}

/**
 * Point the version cache at a directory this file controls, so what follows is
 * decided here and never by what the machine running the suite has on disk.
 */
function withCachedLatestVersion(latestVersion: string): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-docs-help-"));
  fs.mkdirSync(path.join(dir, ".nexus-mcp"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".nexus-mcp", "version-check.json"),
    JSON.stringify({ lastChecked: Date.now(), latestVersion })
  );
  vi.spyOn(os, "homedir").mockReturnValue(dir);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the docs model's help is the real CLI's help", () => {
  it("resolves every node from the real root program, never from a throwaway", async () => {
    // A path the root program does not contain would otherwise get a locally
    // captured help string that reads exactly like a real one. `helpSource`
    // makes that visible; this asserts it never happens. A registrar defined in
    // `src/commands/` and never wired into `buildRootProgram` is the case.
    const nodes = await deriveCommandNodes();
    const orphans: CommandNode[] = nodes.filter((node) => node.helpSource !== "root-program");

    expect(orphans.map((node) => `${node.path} (${node.sourceModule})`)).toEqual([]);
    expect(nodes.length).toBeGreaterThanOrEqual(DOCUMENTED_PATHS_FLOOR);
  });

  it("renders help byte-identical to the shipped binary on every documented path", async () => {
    const real = realRootProgram();
    const documented = await documentedHelp();

    const failures: string[] = [];
    for (const { path, help } of documented) {
      const live = real.get(path);
      if (live === undefined) {
        failures.push(`\`${path}\` is documented and the root program has no such command.`);
        continue;
      }
      const expectedHelp = captureHelp(live);
      if (expectedHelp !== help) failures.push(describeHelpDifference(path, expectedHelp, help));
    }

    expect(
      failures.length === 0
        ? []
        : [`${failures.length} of ${documented.length} documented paths differ:`, ...failures]
    ).toEqual([]);
  });

  it("captures help as a function of the tree and the version, never of this machine", () => {
    // A LIVE `--help` reads `~/.nexus-mcp/version-check.json` while it renders,
    // so an unwrapped capture makes a docs page a function of whichever machine
    // last ran a real command. It would freeze `Update available: <x> → <y>`
    // into committed markdown that CI, having no cache, could never reproduce.
    withCachedLatestVersion("99.0.0");

    const real = realRootProgram();
    const [firstPath] = [...real.keys()].sort();
    const command = real.get(firstPath ?? "");
    expect(command).toBeDefined();
    if (command === undefined) return;

    // POSITIVE CONTROL, and it is the half that makes the assertion below mean
    // anything: prove the planted cache is READ on this exact command. Without
    // it, a typo in the cache file, a missed mock or a renamed field all produce
    // a clean "no update notice" that reads exactly like the suppression
    // working.
    let raw = "";
    command.configureOutput({
      writeOut: (text: string) => {
        raw += text;
      },
      writeErr: () => {}
    });
    command.outputHelp();
    expect(raw).toContain(`Update available: ${VERSION} → 99.0.0`);

    expect(captureHelp(command)).not.toContain("Update available");
  });

  it("publishes both blocks `index.ts` installs on the finished tree", async () => {
    const documented = await documentedHelp();

    const missingScopeFooter = documented
      .filter((entry) => !entry.help.includes(HELP_SCOPE_HEADING))
      .map((entry) => entry.path);

    // `known-issues` is the ONE command the pointer deliberately omits — it
    // would tell a reader to run the reporter on the reporter. Its subcommands
    // still carry it, so this excludes exactly one path and not a prefix.
    const missingKnownIssues = documented
      .filter((entry) => entry.path !== "known-issues")
      .filter((entry) => !entry.help.includes(KNOWN_ISSUES_HELP_PREFIX))
      .map((entry) => entry.path);

    expect({
      documented: documented.length,
      missingScopeFooter,
      missingKnownIssues
    }).toEqual({
      documented: documented.length,
      missingScopeFooter: [],
      missingKnownIssues: []
    });
  });
});
