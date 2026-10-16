/**
 * THE ROOT PROGRAM, FOR ANY TOOL THAT NEEDS THE TREE RATHER THAN THE CLI.
 *
 * `buildRootProgram()` returns the real configured root — the same object the
 * binary parses with, program-level options included — and builds it without
 * parsing anything. Import it from here or from `./index`; they are the same
 * function.
 *
 * ── WHY THE FUNCTION IS DECLARED IN `index.ts` AND NOT HERE ──────────────────
 *
 * `index.ts` is tsup's single bundle entry and the file `package.json` points
 * `bin` at, so the entry-point guard that decides whether to PARSE argv has to
 * live there. `buildRootProgram` is declared beside it, and the body composes
 * one `root-*.ts` sibling per concern.
 *
 * 🔴 THREE OF THOSE SIBLINGS ARE READ AS TEXT BY A SPEC AND EACH SAYS SO IN ITS
 * OWN HEADER — `root-namespace-registrars.ts` and the `root-help-epilogue.*`
 * set. Moving a declaration between them without moving the spec that reads it
 * makes this package's own gates report a defect that does not exist; that has
 * happened once already, and the headers are what stop it happening silently.
 *
 * This module stays as the name consumers reach for, because `root-program`
 * says what it gives you and `index` does not. It imports nothing back.
 */
export { buildRootProgram, VERSION } from "./index";
