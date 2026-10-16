// ---------------------------------------------------------------------------
// Envelope output — the whole response, with a human view of one part of it
// ---------------------------------------------------------------------------

import { emitDocument, isJsonMode } from "./output-json-mode";

/**
 * Emit the SERVER'S OWN RESPONSE under `--json`, and render a human view of
 * whichever part of it a terminal can usefully show.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 NARROWING THE RESPONSE BEFORE THE OUTPUT-FORMAT BRANCH DELETES FIELDS FROM
 *    `--json` THAT NOTHING DOWNSTREAM CAN RECOVER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `GET /folders` answers `{folders, assignments}`, and `folder list` opened with
 *
 *     const folders = result.folders ?? result;
 *     printTable(folders, COLUMNS);
 *
 * One line ABOVE the printer, so the choice of what to keep was made before
 * anything knew whether the caller asked for a table or for a document.
 * `printTable` then emitted the array it was handed and `--json` carried
 * folders alone. `assignments` is the ONLY agent-to-folder map the API
 * publishes — folder rows carry no membership — so the flag whose whole purpose
 * is machine consumption was the one that could not answer "which folder is
 * this agent in".
 *
 * The shape is copy-paste, not a one-off: the table wants one array, so the
 * action takes one array, and the document silently inherits the table's taste.
 * Two commands (`skill-folder list`, `permissions list-resource-access`) had
 * already been cured BY HAND with an `if (isJsonMode()) { console.log(JSON…) }`
 * early return — a correct fix that has to be remembered, that bypasses
 * `emitDocument` and so drops out of the one-document guarantee, and that
 * makes the command unclassifiable to `json-shape.scan.ts` and therefore
 * silent in `--help`.
 *
 * So the split becomes a function. The ENVELOPE is what a script gets; the
 * callback runs only when there is a terminal to draw for, and cannot reach the
 * document at all. A call site cannot narrow the wrong channel because it never
 * chooses the channel.
 *
 * ⚠️ `render` MUST NOT emit a document of its own. It is not called in JSON mode,
 * so anything it prints is human-channel by construction — that is the property
 * `json-shape.scan.ts` relies on when it treats this printer as dominant over
 * whatever printer runs inside the callback.
 */
export function printEnvelope<E extends object>(envelope: E, render: () => void): void {
  if (isJsonMode()) {
    emitDocument(envelope);
    return;
  }

  render();
}
