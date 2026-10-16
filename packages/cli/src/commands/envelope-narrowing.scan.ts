/**
 * WHICH `--json` DOCUMENTS ARE MISSING A FIELD THE SERVER SENT — DERIVED, NOT LISTED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE ACTION CHOOSES WHAT TO KEEP BEFORE ANYTHING KNOWS WHICH CHANNEL IT IS ON
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `GET /folders` answers `{folders, assignments}` and `folder list` opened with
 *
 *     const folders = result.folders ?? result;
 *     printTable(folders, COLUMNS);
 *
 * `printTable` owns the `if (isJsonMode())` branch, so it is the only line that
 * knows whether a table or a document is wanted — and the narrowing happens the
 * line ABOVE it. By the time the branch runs, `assignments` is gone from both
 * arms. `--json`, the flag whose whole purpose is machine consumption, was the
 * one that could not answer "which folder is this agent in".
 *
 * That is a SHAPE, not an incident. A table takes one array, so the action takes
 * one array, and the document quietly inherits the table's taste. Nothing about
 * it is visible in a diff, in `tsc`, or in the output — the JSON is well-formed
 * and complete-looking, and a `jq` for the missing key returns `null`, which
 * reads as an empty field rather than as a field that was deleted upstream.
 *
 * So this scan asks the question directly, with the type checker rather than a
 * regular expression: **when a printer is handed one property of a response,
 * what happens to that response's OTHER properties?**
 *
 *   · every key read somewhere the caller can still see  -> nothing is lost
 *   · a key read nowhere, or only into the human channel -> REPORTED
 *
 * A grep cannot ask it. `result.folders ?? result` and `printList(result.items,
 * undefined, cols)` are the same defect in two spellings, and neither is
 * distinguishable by text from the many correct sites that pass a property of a
 * SINGLE-key envelope, where there is nothing else to lose.
 *
 * ── THE TWO `isJsonMode()` RULES, AND WHY BOTH EXIST ────────────────────────
 *
 * 🚨 A KEY READ INTO THE TERMINAL IS STILL LOST FROM THE DOCUMENT, AND WITHOUT
 * THIS RULE THE SCAN REPORTS THE OPPOSITE. `analytics query` reads `rowCount`,
 * `truncated` and `executionTimeMs` — inside `if (!isJsonMode())`, onto stderr.
 * A naive "is this key mentioned anywhere in the action" test sees three reads
 * and calls the command clean, while `--json` still cannot tell a complete
 * answer from a truncated one. A read under `!isJsonMode()` therefore does NOT
 * count.
 *
 * ⚠️ AND THE MIRROR OF IT: a printer CALL under `!isJsonMode()` writes no
 * document at all, so it cannot drop a field from one. `tracing get` prints the
 * whole trace with `printRecord` and then renders `trace.generations` as a
 * second table guarded exactly that way. Without this arm the scan reports a
 * command whose document is already complete.
 *
 * Both arms key on the same syntactic fact, and the fact is a deliberate idiom
 * in this package rather than a coincidence — `output.ts` exports `isJsonMode`
 * for precisely this.
 *
 * ── WHAT THIS DELIBERATELY CANNOT SEE ───────────────────────────────────────
 *
 * 🚨 SAYING SO IS THE POINT. A gate whose documentation claims completeness is
 * how a whole class reads as closed:
 *
 *   · **an action that builds its own document** with `console.log(JSON.stringify
 *     (x))`. The shape is whatever that expression evaluates to, and nothing
 *     syntactic knows. `json-shape.scan.ts` refuses the same population for the
 *     same reason;
 *   · **a narrowing behind a helper**. The walk resolves an identifier through
 *     its own initializer and no further, so `renderFolders(result)` hides
 *     whatever it does inside;
 *   · **a field the SERVER sends and the SDK's type does not declare.** The
 *     population is the declared type, so an undeclared key is invisible here
 *     AND to every consumer reading the SDK — a different defect, gated
 *     elsewhere by the response-contract check;
 *   · **a key dropped inside a nested object** rather than at the top level.
 *     This reads one level.
 *
 * ── THE PARTS ───────────────────────────────────────────────────────────────
 *
 * This file is the scan's DOCUMENT and its public surface; the bodies live in
 * `envelope-narrowing/`, one concern per file:
 *
 *   · `narrowing.ts`               the finding shape, its key, and the scan root;
 *   · `json-mode.ts`               the two `isJsonMode()` rules above;
 *   · `envelope-callback.ts`       the cure, so it is not read as the disease;
 *   · `expressions.ts`             peeling wrappers, and the body a response lives in;
 *   · `document-keys.ts`           which keys still reach the document;
 *   · `call-site.ts`               the three printers, the exemptions, the call site;
 *   · `scan-printer-call-sites.ts` the one walk that answers both questions.
 *
 * 🚨 THE SCAN ROOT IS RESOLVED FROM ITS OWN MODULE, SO IT MOVED WITH THE SPLIT.
 * `defaultScanRoot` sat in THIS file and resolved `".."`; it sits one directory
 * deeper now and resolves `".." , ".."`. Both spellings answer `src/`, and a
 * wrong one would answer `src/commands/` while leaving every count in this
 * scan unchanged — the printers are all under `commands/`. `narrowing.ts`
 * carries that argument at the resolver, which is where it reaches whoever
 * moves the file next.
 *
 * ⚠️ THE EXPORT LIST BELOW IS EXACTLY WHAT THIS FILE EXPORTED BEFORE THE SPLIT,
 * AND DELIBERATELY NOT ONE NAME MORE. `NARROWING_PRINTERS` became an export of
 * `call-site.ts` so the walk can read it, and is NOT re-exported here: widening
 * this module's public surface under cover of a refactor is a behaviour change
 * nothing in a green suite reports. A part that needs a sibling's helper
 * imports it directly.
 */

export type { PrinterCallSite, PrinterExemption } from "./envelope-narrowing/call-site";
export {
  defaultScanRoot,
  type EnvelopeNarrowing,
  narrowingKey
} from "./envelope-narrowing/narrowing";
export {
  narrowingsIn,
  scanEnvelopeNarrowing,
  scanPrinterCallSites
} from "./envelope-narrowing/scan-printer-call-sites";
