/**
 * THE ROOT PROGRAM, FOR ANY TOOL THAT NEEDS THE TREE RATHER THAN THE CLI.
 *
 * `buildRootProgram()` returns the real configured root — the same object the
 * binary parses with, program-level options included — and builds it without
 * parsing anything. Import it from here or from `./index`; they are the same
 * function.
 *
 * ── WHY THE IMPLEMENTATION IS IN `index.ts` AND NOT HERE ─────────────────────
 *
 * It was here briefly, and moving the DECLARATIONS out of `index.ts` broke five
 * test files that derive facts by reading `src/index.ts` AS TEXT: the
 * auto-update flag pair, the registrar wiring, the global option set, the
 * generated-docs projection. Each went red naming a file that had simply
 * stopped being where the CLI is declared — this package's own gates reporting
 * a defect that did not exist.
 *
 * So `index.ts` kept every declaration and moved only its SIDE EFFECT behind an
 * entry-point guard. This module stays as the name consumers reach for, because
 * `root-program` says what it gives you and `index` does not.
 */
export { buildRootProgram, VERSION } from "./index";
