import { CLI_CODES } from "./errors-cli-codes";
import { color, emitDocument, isJsonMode } from "./output";

/**
 * The error document, and it is ONE shape with THREE always-present keys.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 EVERY KEY IS REQUIRED. AN OPTIONAL KEY IS A SECOND SHAPE WEARING ONE NAME.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `code` could have been optional — most failures are `NexusApiError`s, which
 * always carry one. It is required instead because every branch of `handleError`
 * can derive one, and a field that is present for some failures and absent for
 * others forces every consumer to write a presence check before it can branch.
 * That is two shapes with one name, which is exactly what the "one error shape"
 * guarantee exists to prevent. A code is always derivable, so it is always there.
 *
 * `hint` is required for the same reason, and it is a CORRECTION: it used to be
 * `string | undefined`, and `JSON.stringify` OMITS an undefined key — so the
 * document really was two shapes already, `{message,hint}` and `{message}`,
 * while the comment here claimed one. It is now `string | null`: the key is
 * always present, the value is `null` when there is no hint. A consumer reading
 * `.hint` for truthiness is unaffected; only `"hint" in err` changes, and it
 * changes to the answer that was always intended.
 *
 * So a consumer needs no presence check on any field, and `--json` failures are
 * parseable with one fixed schema.
 */
export interface CliErrorDocument {
  readonly message: string;
  readonly hint: string | null;
  readonly code: string;
}

/**
 * Emit the document, on whichever channel this invocation asked for.
 *
 * THE ONE WRITER. Every verb in `errors-report.ts` and every branch of
 * `handleError` funnels here, so there is exactly one place that decides what a
 * failure looks like and exactly one place to change it.
 */
export function printCliError(
  message: string,
  hint?: string,
  code: string = CLI_CODES.UNKNOWN
): void {
  if (isJsonMode()) {
    const error: CliErrorDocument = { message, hint: hint ?? null, code };
    // Through the funnel, never a bare console.log. A command that printed a
    // partial result and THEN threw would otherwise put the error document
    // beside it on stdout — two documents, and the pipe is unparseable exactly
    // when the caller most needs to read why. First wins: the payload stays on
    // stdout, the error goes to stderr, and the exit code still says 1.
    emitDocument({ error });
    return;
  }

  // The human channel gets the code too — dim and trailing, so it never competes
  // with the message, but a user pasting terminal output into a bug report brings
  // the machine-readable cause with them. Eleven documented workflow codes were
  // reaching this function and dying here, on BOTH channels.
  console.error(color.red("Error:") + " " + message + " " + color.dim(`[${code}]`));
  if (hint) {
    console.error(color.dim("  " + hint));
  }
}

/**
 * The error document, with NO opinion about the exit code.
 *
 * `refuse` and `reportFailure` each decide their own exit code from
 * `src/exit-codes.ts`. The admin tree carries its code on the ERROR instead —
 * `AdminCliError.exitCode`, from the same taxonomy — so it needs the document
 * without the verdict.
 *
 * `code` is REQUIRED here for the same reason `refuse` has none: an optional
 * code is an invitation to ship the default, and the default is a claim.
 */
export function printFailure(message: string, code: string, hint?: string): void {
  printCliError(message, hint, code);
}
