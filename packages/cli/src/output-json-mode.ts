// ---------------------------------------------------------------------------
// The JSON channel — the mode flag, and the ONE funnel every document goes
// through. Every printer in the `output-*` family reads the mode through
// `isJsonMode()` and writes through `emitDocument`; nothing else may.
// ---------------------------------------------------------------------------

let _jsonMode = false;

/**
 * Has a JSON document already been written to STDOUT in this run?
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A SECOND `console.log` UNDER `--json` IS NOT A LONGER DOCUMENT. IT IS TWO,
 *    AND `JSON.parse` REFUSES THE PAIR.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The root epilogue promises "--json prints ONE JSON document on STDOUT and
 * nothing else", and every printer in this family honoured it INDIVIDUALLY while
 * nothing honoured it COLLECTIVELY. `printRecord(resource)` followed by
 * `printSuccess("Created.")` is the whole defect: each call is correct, each
 * writes its own complete document, and the caller receives them concatenated.
 * A script gets `SyntaxError: Unexpected non-whitespace character after JSON`,
 * or — worse — reads only the first and never learns there was a second.
 *
 * Nine commands shipped that pair. Guarding the pair at each call site is a
 * rule, not a mechanism: the tenth call site has the defect again on the day it
 * is written, and nothing tells its author.
 *
 * So the invariant moves into the ONE funnel every document goes through.
 * {@link emitDocument} keeps a per-run flag and FIRST WINS: the first document
 * is the payload and goes to stdout; anything after it goes to STDERR, where the
 * profile banner and every warning already live. Nothing is lost, the pipe stays
 * parseable, and a call site cannot reintroduce the defect by being written.
 *
 * FIRST, not last, and that ordering is a decision rather than an accident. In
 * every observed pair the first document is the resource and the second is a
 * confirmation sentence about it — `printRecord(sender)` then "WhatsApp sender
 * created." A script wants the sender.
 *
 * ⚠️ WHAT THIS DOES NOT REACH: a command that calls `console.log` itself. Around
 * forty commands build their own document with a bare
 * `console.log(JSON.stringify(...))` rather than going through a printer, and a
 * module-level flag cannot see a write it is not asked to make. That half is
 * covered by a gate rather than by construction —
 * `json-one-document.test.ts` drives every leaf and parses its stdout — which is
 * strictly weaker, and saying so here is the point: the gate reports, this makes
 * impossible, and only the printers are in the second category.
 */
let _documentEmitted = false;

/**
 * Enter or leave JSON mode, and START A NEW RUN.
 *
 * The reset is load-bearing rather than tidy. One `nexus` process runs one
 * command and exits, so the flag would never need clearing in production — but
 * a test file runs dozens of commands in one process, and a flag that survived
 * between them would divert the SECOND test's only document to stderr and read
 * as a command printing nothing at all. The mode change IS the run boundary, in
 * the binary and in a spec alike, so it is the only place that clears it.
 */
export function setJsonMode(enabled: boolean): void {
  _jsonMode = enabled;
  _documentEmitted = false;
}

export function isJsonMode(): boolean {
  return _jsonMode;
}

/**
 * Write one JSON document, or divert it to stderr if stdout already has one.
 *
 * THE ONLY WAY THIS FAMILY WRITES JSON TO STDOUT. `errors.ts` routes its error
 * document through it too, so a command that printed a partial result and then
 * failed still leaves exactly one document on stdout — and still exits non-zero,
 * which is what the epilogue tells a caller to read.
 *
 * See {@link _documentEmitted} for why the guard lives here and what it cannot
 * see.
 */
export function emitDocument(value: unknown): void {
  const text = JSON.stringify(value, null, 2);

  if (_documentEmitted) {
    process.stderr.write(text + "\n");
    return;
  }

  _documentEmitted = true;
  console.log(text);
}

/** Whether {@link emitDocument} has already claimed stdout. For the gate. */
export function jsonDocumentEmitted(): boolean {
  return _documentEmitted;
}
