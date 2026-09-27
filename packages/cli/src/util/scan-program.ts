import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

/**
 * THE ONE COMPILER CONFIGURATION EVERY SOURCE SCAN IN THIS PACKAGE WALKS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 TWO SCANNERS WITH DIFFERENT OPTIONS SCAN DIFFERENT TREES, AND BOTH PRINT A
 *    TICK.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The gates in `src/commands/*.scan.ts` are type-checked walks: each one builds a
 * `ts.Program` over this package's sources and asks the checker a question the
 * AST alone cannot answer. What a program RESOLVES is decided by these options —
 * `moduleResolution` above all — so two scanners holding their own copy can come
 * to disagree about which files exist at all.
 *
 * That failure is silent by construction. A gate whose program resolves a smaller
 * tree than its author believes does not report a smaller denominator; it reports
 * no findings over the files it never opened, which renders byte-for-byte
 * identically to a clean tree. Nothing goes red, no count looks wrong, and the
 * gate goes on printing a tick over the exact class it was built to catch.
 *
 * So the options live HERE, once. A change to them moves every scan together, and
 * a divergence has nowhere to hide.
 *
 * ⚠️ THAT TRADE CONCENTRATES THE HOLE RATHER THAN CLOSING IT: one line here now
 * blinds every scan at once, where before it blinded one and left the other
 * correct. `scan-program.test.ts` is the floor that exists because of it, and it
 * asserts REACHABILITY PER PACKAGE rather than a file count — a wrong
 * `moduleResolution` leaves this package's own sources resolving perfectly and
 * silently drops the dependency closure the scanners read their types through.
 *
 * ── THE FILE LIST IS THE OTHER HALF, AND IT LIVES HERE TOO ───────────────────
 *
 * A program's population is the product of two things: these options, and the
 * file list. {@link scanSourceFiles} is that list, and the two used to diverge —
 * `status-verdict.scan.ts` excluded `.d.ts` from its walk and
 * `envelope-narrowing.scan.ts` did not, so the first `.d.ts` anybody added would
 * have made two gates scan two trees.
 *
 * ── WHY `.d.ts` IS INCLUDED, WHICH IS THE SIDE THAT LOOKS WRONG ──────────────
 *
 * 🚨 EXCLUDING IT IS THE UNSAFE SIDE, AND IT IS THE ONE THE STRICTER-FILTER
 * INSTINCT REACHES FOR. Two measured facts settle it.
 *
 * FIRST, a `.d.ts` cannot produce a finding whichever enumerator ran. Every walk
 * loop in these scans opens `if (source.isDeclarationFile) continue;`, and a
 * `.d.ts` cannot even hold the syntax they match — parsed, `declare function
 * printTable(x: unknown): void;` yields ZERO call expressions where the same text
 * in a `.ts` yields one. So including it costs no finding and no verdict.
 *
 * SECOND, what the enumerator actually decides is whether an ambient `.d.ts` in
 * `src/` is a program ROOT — which decides whether the CHECKER resolves the types
 * these gates read. Measured over a two-file fixture, an ambient `interface
 * Verdict { ok: boolean }` beside a source that uses it:
 *
 *     roots                       properties of the resolved type   diagnostics
 *     [probe.ts]                  []            isAny=true          1  Cannot find name 'Verdict'
 *     [probe.ts, ambient.d.ts]    [ok]          isAny=false         0
 *
 * ⚠️ AND `typeToString` PRINTS `Verdict` IN BOTH ROWS, so the wrong answer reads
 * right. The property list and the diagnostic are the instruments that can report
 * the bad news; the name cannot.
 *
 * That `any` is not inert. `isVerdictShaped` in `status-verdict.scan.ts` matches
 * boolean, string and array and returns `false` for anything else, so an
 * unresolved field drops its leaf out of the population. `scanEnvelopeNarrowing`
 * reports "keys of the declared type no read reaches", and over an error type
 * that key set is EMPTY — a tick, byte-identical to a clean site. Both are the
 * silent tick the header above is about, arriving through the file list instead
 * of through the options.
 *
 * ── WHY `noEmit` ─────────────────────────────────────────────────────────────
 *
 * Nothing here compiles anything. The program exists for its type checker, so any
 * emit would be output nobody reads written into a tree somebody else builds.
 */
export const SCAN_COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  esModuleInterop: true,
  noEmit: true
};

/**
 * Every file a source scan hands to {@link createScanProgram}, from `dir` down.
 *
 * `.ts` and `.d.ts`; never a `.test.ts`. The header above owns why `.d.ts` is in
 * and why that is the safe side. A spec is out because a gate reports on the
 * SHIPPED tree — a printer call or a verdict field inside a spec is a fixture,
 * and counting one as a finding would make every gate here report its own
 * fixtures at itself.
 *
 * @param dir Absolute path of the directory to walk.
 */
export function scanSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return scanSourceFiles(full);
    if (!entry.name.endsWith(".ts")) return [];
    if (entry.name.endsWith(".test.ts")) return [];
    return [full];
  });
}

/**
 * Build the `ts.Program` a source scan walks.
 *
 * @param fileNames Absolute paths of the files the scan enumerated — normally
 * {@link scanSourceFiles}' return, so the population is the pair this module owns.
 */
export function createScanProgram(fileNames: readonly string[]): ts.Program {
  return ts.createProgram([...fileNames], SCAN_COMPILER_OPTIONS);
}
