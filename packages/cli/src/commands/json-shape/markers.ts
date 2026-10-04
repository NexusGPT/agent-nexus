/**
 * The two marker sets: names meaning "this action writes its own `--json`
 * document", and the error emitters that are not a shape decision.
 */

/**
 * Names that mean "this code WRITES a `--json` document itself", so a printer
 * beside them may be on a branch `--json` never takes.
 *
 * 🚨 THIS IS NOT DEFENSIVENESS. WITHOUT IT THE SCAN SHIPS A FALSE SHAPE.
 * Measured: `workspace search` opens with
 *
 *     if (isJsonMode()) { console.log(JSON.stringify(res, null, 2)); return; }
 *
 * and only then falls through to `printTable`. The printer is real, it is in
 * the body, and it is UNREACHABLE under the one flag this whole module is about
 * — so classifying it yields "a bare array" for a command whose help correctly
 * says the document is the raw server object.
 *
 * 🚨 `isJsonMode` IS NOT A MARKER, AND PUTTING IT HERE COST 36 CORRECT
 * CLASSIFICATIONS. READING the flag is not WRITING a document: `printItems` and
 * `printImportResult` in `cloud-import.ts` call `printList` UNCONDITIONALLY and
 * consult the flag only to suppress a human-only footer underneath it. Their
 * `--json` shape is a determinate `{data, …}`, and treating the read as an
 * output decision dropped the whole cloud-import browse/search/import family
 * from the map.
 *
 * The two commands this refusal exists for are caught by the WRITE alone —
 * `workspace search` through `console.log(JSON.stringify(…))` in its action,
 * `role automation-settings` through the same shape inside `printStatedOrNothing`.
 * So the narrower rule loses nothing it was built to catch.
 */
export const SELF_JSON_MARKERS: ReadonlySet<string> = new Set(["emitDocument"]);

/**
 * The error document's own writers, and they are TERMINALS like the printers.
 *
 * 🚨 EVERY ACTION'S `catch` REACHES `emitDocument` THROUGH ONE OF THESE. The
 * root epilogue documents the failure shape separately — `{"error":{…}}` on
 * stdout, exit 1 — and it is the same for every command, so it is not a second
 * SUCCESS shape and must not refuse a leaf. Following them marks the entire
 * tree.
 */
export const ERROR_EMITTERS: ReadonlySet<string> = new Set([
  "handleError",
  "printCliError",
  "printFailure",
  "printNotFound",
  "refuse",
  "reportFailure"
]);
