import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

import { defaultScanRoot } from "../commands/status-verdict.scan";
import { createScanProgram, scanSourceFiles } from "./scan-program";

/**
 * THE ANTI-VACUITY FLOOR FOR THE ONE PROGRAM EVERY SOURCE SCAN WALKS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 SHARING THE OPTIONS BLOCK CONCENTRATED A HOLE THAT USED TO BE SPLIT IN TWO.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Before `createScanProgram` existed, three copies of the compiler options sat in
 * two scanners. Two copies drifting apart was the hazard, and it was silent: a
 * gate whose program resolves less than its author believes reports no findings
 * over what it never opened, which renders identically to a clean tree.
 *
 * Extracting them closes that. It also makes ONE line able to blind ALL THREE
 * sites at once, which is strictly cheaper to open than the divergence it
 * replaced. Measured, not argued — with a real narrowing planted at a known line
 * and `moduleResolution` flipped from `Bundler` to `Classic` in the single block
 * above, `envelope-narrowing.test.ts` goes 29/29 green and `status-verdict.test.ts`
 * 16/16 green over violations they had just named by file and line.
 *
 * So the shared block needs a gate of its own. This is it.
 *
 * ── WHY THIS ASSERTS PACKAGES AND NOT A COUNT ────────────────────────────────
 *
 * 🔴 A COUNT FLOOR CANNOT CATCH THAT MUTANT, AND WRITING ONE WOULD HAVE LOOKED
 * LIKE PROTECTION. Under `Classic` the program resolves the package's OWN sources
 * perfectly — 771 files either way, measured — because those are reached by
 * relative specifiers that every resolution mode handles. What collapses is the
 * DEPENDENCY closure: `@agent-nexus/sdk` 108 files to 0, `@nexus/vibe-app-vendoring`
 * 5 to 0, `commander` 2 to 0. The scanners ask the type checker what an SDK call
 * RETURNS; with the SDK unresolved every such type degrades and every question
 * they ask answers "nothing to report".
 *
 * A floor on the TOTAL would technically move (938 to 822) and is the wrong
 * instrument anyway: set high enough to see a 12% drop it reds the day anyone
 * removes a dependency, and the next person to meet it red lowers it. That is how
 * a floor becomes decoration. Reachability per package has no such tension — the
 * honest bound is ONE file, it can never false-fire on growth or on a refactor,
 * and it is exactly the figure `Classic` drives to zero.
 */

const ROOT = defaultScanRoot();

/**
 * Real entry points, not a re-implementation of either scanner's own file walk.
 *
 * What is under test is RESOLUTION — what the options reach from a root — so a
 * handful of genuine roots answers it and the walk is irrelevant here. The two
 * scanners are named because they are the callers this gate exists for; `index.ts`
 * is named because it is what the published bundle enters through.
 */
const ROOTS = [
  "index.ts",
  "commands/envelope-narrowing.scan.ts",
  "commands/status-verdict.scan.ts"
].map((relative) => path.join(ROOT, relative));

/**
 * Packages whose declared types the scanners READ THROUGH. Each is imported by
 * this package's own sources, so a program that cannot reach one is a type checker
 * answering `any` to every question asked about it — silently, and with no finding
 * anywhere to say so.
 */
const MUST_RESOLVE = [
  "/packages/sdk/",
  "/vibe-app-vendoring/",
  "/node_modules/commander/"
] as const;

/**
 * Floor on the package's own sources.
 *
 * A bound on a DISCOVERED population, so it is deliberately loose: `src/` only
 * grows, today's reading is 771, and 600 sits far below any deletion this package
 * has ever taken in one change.
 *
 * ⚠️ IT DOES NOT DISCRIMINATE A RESOLUTION FAILURE, and saying so is the point of
 * writing it down — 771 is the reading under `Bundler` AND under `Classic`. What
 * it catches is the other way a program goes quiet: a root list that collapsed, or
 * a walk that stopped early. {@link MUST_RESOLVE} is the arm that catches the
 * options.
 */
const OWN_SOURCE_FLOOR = 600;

const resolvedFileNames = createScanProgram(ROOTS)
  .getSourceFiles()
  .map((source) => source.fileName);

describe("createScanProgram resolves the tree the scanners believe they walk", () => {
  it("reaches every package the scanners read types through", () => {
    const unreachable = MUST_RESOLVE.filter(
      (marker) => !resolvedFileNames.some((file) => file.includes(marker))
    );

    expect(
      unreachable,
      `\n\n${unreachable.join("\n")}\n\n` +
        "The shared compiler options resolved NONE of the packages above.\n" +
        "Every gate built on this program is now asking the type checker about\n" +
        "types it cannot see, and each one answers by reporting nothing — which\n" +
        "is byte-identical to a clean tree. Fix SCAN_COMPILER_OPTIONS; do not\n" +
        "shorten this list.\n"
    ).toEqual([]);
  });

  it("reaches this package's own sources", () => {
    const own = resolvedFileNames.filter((file) => file.startsWith(`${ROOT}${path.sep}`));

    expect(
      own.length,
      `resolved only ${own.length} file(s) under ${ROOT}, floor is ${OWN_SOURCE_FLOOR}`
    ).toBeGreaterThanOrEqual(OWN_SOURCE_FLOOR);
  });

  it("CONTROL — every declared root is a real file, so an empty program cannot read as a pass", () => {
    const missing = ROOTS.filter((file) => !fs.existsSync(file));

    expect(missing, `\n\n${missing.join("\n")}\n`).toEqual([]);
  });

  /**
   * Each control is its own block. A failing assertion throws and abandons every
   * arm below it in the same `it`, so two controls folded together would report
   * one verdict and leave the second unscored — the failure mode this whole file
   * exists to refuse, one scale down.
   */
  it("CONTROL — the root list is not empty, so `unreachable` cannot be vacuously []", () => {
    expect(ROOTS.length).toBeGreaterThan(0);
  });

  it("CONTROL — the program resolved something at all", () => {
    expect(resolvedFileNames.length).toBeGreaterThan(0);
  });
});

/**
 * THE OTHER HALF OF THE POPULATION: THE FILE LIST.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A `.d.ts` DROPPED FROM THE ROOTS COSTS NO FINDING AND SILENTLY COSTS THE
 *    TYPES. THAT ASYMMETRY IS WHAT THESE ARMS PIN.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `scanSourceFiles` includes `.d.ts`, and the instinct that says a gate should
 * scan fewer files reads that as the loose side. It is the safe side, and only the
 * CONSEQUENCE arm below can say so: a `.d.ts` can never yield a finding — every
 * scan's walk loop opens `if (source.isDeclarationFile) continue;` — so the ONLY
 * thing its presence in the root list changes is whether the checker resolves the
 * ambient declarations these gates read their types through.
 *
 * Dropped, the type is the `any` error type: zero properties, and one `Cannot find
 * name` diagnostic nobody is reading. `isVerdictShaped` returns `false` for `any`
 * and drops the leaf; `scanEnvelopeNarrowing` reports the declared keys no read
 * reaches and over an error type that set is EMPTY. Both print a tick.
 *
 * ⚠️ `checker.typeToString` PRINTS THE WRITTEN NAME IN BOTH CASES, so it cannot
 * be the instrument here. The arms below read the PROPERTY LIST and the semantic
 * diagnostics, which are the two readings that differ.
 */

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-program-dts-"));
const fixtureAmbient = path.join(fixtureDir, "ambient.d.ts");
const fixtureSource = path.join(fixtureDir, "probe.ts");
const fixtureSpec = path.join(fixtureDir, "probe.test.ts");

// No import and no export, so `FixtureVerdict` is AMBIENT — reachable only when
// this file is a program root. A `.d.ts` that is merely imported resolves either
// way, which is why the fixture is deliberately the ambient shape.
fs.writeFileSync(fixtureAmbient, "interface FixtureVerdict { ok: boolean }\n");
fs.writeFileSync(fixtureSource, "export const probe: FixtureVerdict = { ok: true };\n");
fs.writeFileSync(fixtureSpec, "export const notScanned = 1;\n");

afterAll(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));

/** Property names of `probe`'s type, as the checker resolves it from `roots`. */
function propertiesOfProbe(roots: readonly string[]): string[] {
  const program = createScanProgram(roots);
  const checker = program.getTypeChecker();
  const file = program.getSourceFile(fixtureSource);
  if (file === undefined) return [];
  let names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      names = checker
        .getPropertiesOfType(checker.getTypeAtLocation(node.name))
        .map((symbol) => symbol.getName());
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

describe("scanSourceFiles hands the scanners a list their checker can answer from", () => {
  it("includes a .d.ts, so an ambient declaration is a program root", () => {
    expect(scanSourceFiles(fixtureDir)).toContain(fixtureAmbient);
  });

  it("resolves an ambient type — the consequence the .d.ts rule exists for", () => {
    expect(
      propertiesOfProbe(scanSourceFiles(fixtureDir)),
      "\n\nThe checker could not resolve `FixtureVerdict`, so every gate built on\n" +
        "this program is reading the `any` error type. That reports NO findings,\n" +
        "which is byte-identical to a clean tree. Put `.d.ts` back in\n" +
        "`scanSourceFiles`; do not weaken this arm.\n"
    ).toEqual(["ok"]);
  });

  it("CONTROL — dropping the .d.ts root really does lose the type, so the arm above can fail", () => {
    expect(propertiesOfProbe([fixtureSource])).toEqual([]);
  });

  it("CONTROL — dropping the .d.ts root raises a diagnostic nothing in a gate reads", () => {
    const program = createScanProgram([fixtureSource]);
    const messages = program
      .getSemanticDiagnostics(program.getSourceFile(fixtureSource))
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));

    expect(messages).toEqual(["Cannot find name 'FixtureVerdict'."]);
  });

  it("excludes a .test.ts, so a gate cannot report its own fixtures at itself", () => {
    expect(scanSourceFiles(fixtureDir)).not.toContain(fixtureSpec);
  });

  it("CONTROL — the fixture walk found the ordinary source, so the exclusion above is not vacuous", () => {
    expect(scanSourceFiles(fixtureDir)).toContain(fixtureSource);
  });
});
