import { readFileSync } from "node:fs";

import { refuse } from "../../errors";
import type { TemplateCreateOptions } from "./template-create.options";

/**
 * A Twilio Types object, or the exit code that says why one could not be built.
 *
 * A union rather than a throw: an unreadable `--body-file` is the operator's
 * path being wrong, which `handleError` would render as an internal failure.
 */
export type TemplateTypesResolution =
  | { readonly ok: true; readonly types: Record<string, unknown> }
  | { readonly ok: false; readonly exitCode: number };

/**
 * Build the Twilio Types object the create call sends, from whichever of
 * `--body` / `--body-file` was given.
 *
 * Reading the file and parsing it are one unit with their own refusal because
 * they fail as one thing to the operator: "I could not use the path you gave me"
 * covers a missing file, a directory, a permission denial and malformed JSON
 * alike, and `readFileSync`'s message already names which.
 *
 * ⚠️ THE PARSED DOCUMENT IS NOT VALIDATED BEYOND BEING JSON. Twilio owns this
 * shape and the CLI carries no schema for it, so a well-formed object with wrong
 * keys reaches the API and is rejected there rather than here. Callers must keep
 * treating every field of it as a runtime claim.
 */
export function resolveTemplateTypes(opts: TemplateCreateOptions): TemplateTypesResolution {
  if (opts.bodyFile) {
    try {
      return { ok: true, types: JSON.parse(readFileSync(opts.bodyFile, "utf-8")) };
    } catch (error) {
      return {
        ok: false,
        exitCode: refuse(
          `Could not read --body-file: ${error instanceof Error ? error.message : String(error)}`
        )
      };
    }
  }

  return { ok: true, types: { [opts.type ?? "twilio/text"]: { body: opts.body } } };
}
