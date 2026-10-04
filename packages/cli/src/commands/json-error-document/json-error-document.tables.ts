/**
 * The two vocabularies this rule is built on: what counts as prose on stderr,
 * and what counts as a document reaching stdout.
 */

/**
 * Calls that put an unparseable sentence on STDERR.
 *
 * `printWarning` is here beside `console.error` because it IS a `console.error`
 * with a colour — right for a warning that accompanies a result, wrong as the
 * only thing a failing command says. One of the two findings this gate was
 * built from was exactly that: `printWarning` + `process.exitCode = 1`.
 */
export const STDERR_PROSE = new Set(["console.error", "console.warn", "printWarning"]);

/**
 * Calls that put a JSON document on stdout, or route one through the funnel.
 *
 * `handleError`, `refuse`, `reportFailure`, `printFailure` and `printNotFound`
 * all go through `printCliError` → `emitDocument`. The payload printers go
 * through `emitDocument` directly. A bare `console.log(JSON.stringify(...))` is
 * counted too — around forty commands build their document that way rather than
 * through a printer, and a rule that ignored them would report every one of
 * those commands as a violation.
 *
 * 🚨 THE PAYLOAD PRINTERS ARE EVERY FUNCTION IN `output.ts` WITH AN
 * `if (_jsonMode) { emitDocument(…); return; }` BRANCH — read that file, never
 * this list from memory. `printEnvelope` and `printTable` were both absent, and
 * an omission here is a FALSE VIOLATION rather than a missed one: the scan
 * concludes the command exited non-zero having written nothing to stdout, when
 * it wrote the whole document. It surfaced the moment a command that exits on a
 * verdict adopted `printEnvelope` — `prompt-assistant await-thread` and
 * `get-thread --wait`, which print the wait and then exit on its `outcome`.
 */
export const DOCUMENT_EMITTERS = new Set([
  "emitDocument",
  "handleError",
  "printDryRun",
  "printEnvelope",
  "printFailure",
  "printList",
  "printNotFound",
  "printPage",
  "printRecord",
  "printSuccess",
  "printTable",
  "refuse",
  "reportFailure",
  // TWO DOMAIN HELPERS, and they are the only ones here. `reportNodeTestRefusal`
  // (`node-test-verdict.ts`) and `reportRunRefusal` (`run-verdict.ts`) each
  // decide which of `reportFailure` / `printFailure` their subject's verdict
  // means, print it, and return the exit code — so
  // `process.exitCode = reportNodeTestRefusal(verdict)` routes through the
  // funnel exactly as `= reportFailure(…)` does.
  //
  // ⚠️ THEY ARE LISTED BY HAND BECAUSE THIS ONE CHECK IS NOT TRANSITIVE, unlike
  // `proseOnlyHelpers` below. `exitCodeOf` asks `DOCUMENT_EMITTERS.has(name)`
  // about the callee's own name and stops there, so a helper that emits its
  // document one call down reads as prose-only at every call site. Each of these
  // is shared by TWO commands precisely so the two cannot drift apart about what
  // one response means; the alternative was copying a multi-arm decision into
  // both command files, which is the drift this set would then be blind to.
  "reportNodeTestRefusal",
  "reportRunRefusal",
  // `channel/_shared/report-setup-not-ready.ts`, the same shape as the two
  // above: it prints the not-ready arm and RETURNS the code, so
  // `process.exitCode = reportChannelSetupNotReady(…)` routes through the funnel
  // exactly as `= reportFailure(…)` does — its last statement IS
  // `return reportFailure("remote-error", …)`, unconditionally.
  //
  // 🔴 IT IS HERE BECAUSE THE EXIT HAS TO BE VISIBLE TO *TWO* GATES AT ONCE, AND
  // ONLY ONE SHAPE SATISFIES BOTH. `status-verdict.scan.ts` requires the
  // `process.exitCode =` assignment to sit INSIDE the action body, governed by
  // the verdict — an assignment made in the helper is invisible to it and
  // `channel setup`'s `ready`/`status` then read as verdicts printed over an
  // exit of 0. This scan requires that assignment's right-hand side to be a
  // document emitter. So the exit must be in the action AND name something on
  // this list, and blessing the helper is the alternative to copying the whole
  // refusal back into an action the 150/80 ratchet covers.
  //
  // ⚠️ THE BLESSING IS BACKED BY A BEHAVIOURAL ASSERTION, NOT BY THIS COMMENT.
  // `channel-setup-json-verdict.test.ts` runs the command and asserts the ERROR
  // document reaches STDOUT with `error.code` `CLI_REMOTE_ERROR` on the
  // not-ready path, and `channel-setup-verdict-exits.test.ts` asserts the
  // non-zero exit. Should this helper ever stop emitting, those red before this
  // list's silence can matter.
  "reportChannelSetupNotReady"
]);
