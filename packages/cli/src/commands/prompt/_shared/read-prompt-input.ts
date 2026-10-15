import fs from "node:fs";

import { refuse } from "../../../errors";

/**
 * Resolve `--file` / `--text` into the prompt body, or refuse.
 *
 * Exactly one of the two is required. Both, or neither, is refused HERE rather
 * than sent, so a malformed invocation never reaches the API.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 IT ASSIGNS `process.exitCode` ITSELF, AND THAT IS THE WHOLE CONTRACT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `refuse()` RETURNS the invalid-input exit code; it does not set it — its own
 * declaration says *"assign it to `process.exitCode`"*. The three refusals here
 * called it BARE, discarding that code, so each printed a correct refusal
 * document and left the process exiting **0**. Measured on the parent commit:
 * all three answered `exitCode=undefined`.
 *
 * Two shapes were available and only one of them is this package's. `return
 * refuse(...)` propagates, but the caller needs the BODY back and a number is
 * not one; threading a second channel out of a helper whose whole job is to
 * yield a string is a worse seam than this one. So the helper owns the whole
 * refusal — document and status — and `undefined` means "already refused, stop".
 * That is the ASSIGNED form, which is this CLI's majority spelling and what
 * `commands/credential/connect.command.ts` and
 * `commands/deployment/list.command.ts` use at every one of their own refusal
 * sites.
 *
 * `prompt-refuses-with-the-invalid-input-code.test.ts` drives all three paths
 * and reads the status, because a refusal document printed beside exit 0 is
 * byte-identical on stdout to one printed beside the right code — which is
 * exactly why the sibling spec's "the transport stayed silent" could not see
 * this.
 *
 * @returns the prompt body, or `undefined` having already refused AND set
 * `process.exitCode`. A caller returns on `undefined` and prints nothing more.
 */
export async function readPromptInput(opts: {
  file?: string;
  text?: string;
}): Promise<string | undefined> {
  if (opts.file !== undefined && opts.text !== undefined) {
    process.exitCode = refuse("Pass --file or --text, not both.");
    return undefined;
  }
  if (opts.text !== undefined) return opts.text;
  if (opts.file !== undefined) {
    if (!fs.existsSync(opts.file) || !fs.statSync(opts.file).isFile()) {
      process.exitCode = refuse(`No such file: ${opts.file}`);
      return undefined;
    }
    return fs.readFileSync(opts.file, "utf-8");
  }
  process.exitCode = refuse("A prompt is required: pass --file <path> or --text <string>.");
  return undefined;
}
