import { isJsonMode, printRecord } from "../../../output";

/**
 * Emit the document for a resource that was ALREADY CREATED, then re-throw.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 DEFERRING STDOUT TO ASSEMBLE ONE DOCUMENT MAKES A LATER FAILURE DESTROY AN
 *    EARLIER SUCCESS.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `create --submit` and the two `--wait` verbs each do a real, billed,
 * irreversible thing and THEN keep going. Assembling one document at the end is
 * right for the happy path and wrong for every other: if the submit or the poll
 * throws, the outer handler emits an error document and the id of the template
 * that WAS created never reaches stdout at all. The caller is told the command
 * failed, is not told what it created, and creates it again.
 *
 * So the acquired resource is emitted FIRST, carrying an explicit failure
 * marker, and the error still goes out and still exits 1 — on stderr, because
 * `emitDocument` gives stdout to the first document. One parseable document that
 * names the resource AND says the follow-up failed; a non-zero exit; nothing
 * lost.
 */
export function emitPartialThenRethrow(acquired: object, stage: string, error: unknown): never {
  if (isJsonMode()) {
    printRecord({
      ...acquired,
      incomplete: true,
      failedStage: stage,
      failedReason: error instanceof Error ? error.message : String(error)
    });
  }
  throw error;
}
