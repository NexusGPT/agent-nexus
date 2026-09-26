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
 * ── WHY THIS TAKES `fileNames` AND NOT A ROOT ────────────────────────────────
 *
 * A program's population is the product of two things: these options, and the
 * file list handed in. This function owns the first and deliberately not the
 * second, because the two callers' enumerators DISAGREE:
 * `status-verdict.scan.ts` excludes `.d.ts` from its walk and
 * `envelope-narrowing.scan.ts` does not. That divergence is latent only because
 * `packages/cli/src/` holds no `.d.ts` today, so both return the same list; the
 * first one anybody adds makes two gates scan two trees. Folding the walk in here
 * would settle that by picking a side, which is a behaviour decision dressed as a
 * de-duplication. Converging the two enumerators is its own change.
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
 * Build the `ts.Program` a source scan walks.
 *
 * @param fileNames Absolute paths of the files the scan enumerated.
 */
export function createScanProgram(fileNames: readonly string[]): ts.Program {
  return ts.createProgram([...fileNames], SCAN_COMPILER_OPTIONS);
}
