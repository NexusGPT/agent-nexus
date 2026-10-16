// ---------------------------------------------------------------------------
// Verdict output — a one-line result, and the payload block under it
// ---------------------------------------------------------------------------

import { absentText, isAbsent, jsonPayload } from "./output-absent";
import { color } from "./output-color";
import { emitDocument, isJsonMode } from "./output-json-mode";
import { renderCell } from "./output-render-cell";

/**
 * A 2xx, rendered.
 *
 * 🔴 `message` IS CARRIED INTO THE JSON DOCUMENT, AND THAT IS THE POINT OF THIS
 * FUNCTION HAVING TWO ARGUMENTS.
 *
 * It used to be dropped under `--json`, which made the machine-readable output
 * carry strictly LESS diagnostic information than the human one. That is only
 * cosmetic while the message is a constant restating the data — and it is not a
 * constant everywhere. Eight call sites choose the message on the RESULT:
 *
 *     printSuccess(result.removed ? "Workspace revoked." : "No such grant.",
 *                  { removed: result.removed })
 *
 * There the branch IS the diagnosis. A caller reading the human form was told
 * `No such grant.`; the same call under `--json` got a bare `removed: false`,
 * which reads as "the operation failed" rather than "you named something that
 * does not exist". A user who passed a workspace id where a grant id was wanted
 * had the explanation available and the flag he used threw it away.
 *
 * Derived, not listed: an AST sweep of all 193 `printSuccess` call sites found
 * the 8 with a conditional message, and 0 passing a `message` key of their own —
 * so nothing collides with the key added here. The gate that keeps it that way
 * is `output-json-keeps-the-diagnostic.test.ts`.
 *
 * `message` is added, never substituted, so every existing `--json` consumer
 * reading `success` or a data field is unaffected.
 */
export function printSuccess(message: string, data?: object): void {
  if (isJsonMode()) {
    emitDocument({ success: true, message, ...jsonPayload(data) });
    return;
  }

  console.log(color.green("✓") + " " + message);
  printHumanPayload(data);
}

/** The indented `key: value` block under a one-line verdict. Human channel only. */
function printHumanPayload(data?: object): void {
  if (!data) return;
  for (const [key, value] of Object.entries(data)) {
    const rendered = isAbsent(value) ? absentText(value) : renderCell(value);
    console.log(`  ${color.dim(key + ":")} ${rendered}`);
  }
}

/**
 * A `--dry-run` verdict — the command did NOT act, and said what it would do.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A DRY RUN IS A TERMINAL RESULT, SO UNDER `--json` IT IS A DOCUMENT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `agent delete`, `deployment delete` and `workflow delete` each printed a
 * yellow sentence and returned. Under `--json` that sentence WAS the whole of
 * stdout: unparseable, at exit 0, on the one flag whose entire purpose is to let
 * a script check before it destroys something. The script gets a `SyntaxError`
 * where it asked for a preview, and the obvious recovery — drop `--dry-run` —
 * is the destructive one.
 *
 * `success: true` is deliberately NOT in this envelope. Nothing succeeded; the
 * command declined to act. `dryRun: true` is the discriminator, and a consumer
 * that switches on `success` sees a shape it does not recognise rather than a
 * shape that lies.
 */
export function printDryRun(message: string, data?: object): void {
  if (isJsonMode()) {
    emitDocument({ dryRun: true, message, ...jsonPayload(data) });
    return;
  }

  console.log(color.yellow("DRY RUN:") + " " + message);
  printHumanPayload(data);
}
