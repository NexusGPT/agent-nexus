/**
 * THE CLI'S ERROR LAYER. ONE SPECIFIER, AND AN INDEX OF WHO OWNS WHAT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS FILE RE-EXPORTS AND DECLARES NOTHING, AND THAT IS A GATE REQUIREMENT
 *    RATHER THAN A STYLE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `exit-code-taxonomy.test.ts` resolves every exit-producing function by name
 * across the whole package and requires EXACTLY ONE definition of each — "a gate
 * that cannot tell WHICH definition is called must say so rather than pick one".
 * A wrapper here that forwarded to a sibling would be a second definition and
 * would red that arm. So every line below is an `export … from`, never a
 * re-declaration.
 *
 * ── WHERE EACH CONCERN LIVES ────────────────────────────────────────────────
 *
 *   - `errors-cli-codes.ts`        `CLI_CODES` — the minted-code vocabulary, and
 *                                  the `CLI_*` provenance rule. Imports nothing.
 *   - `errors-published-codes.ts`  the members other modules name, each with the
 *                                  reason it is not a `FailureCause`.
 *   - `errors-failure-cause.ts`    `FailureCause`, and its two maps — the one
 *                                  place the code and exit vocabularies meet.
 *   - `errors-document.ts`         `CliErrorDocument` and the ONE writer,
 *                                  `printCliError`. Why all three keys are
 *                                  required is stated there.
 *   - `errors-report.ts`           the verbs a command calls: `refuse`,
 *                                  `reportFailure`, `failure`, `invalidInput`,
 *                                  `printNotFound`.
 *   - `errors-handle.ts`           `handleError`, a dispatch over error TYPES.
 *   - `errors-api-failures.ts`     the two branches that need a dispatch of
 *                                  their own — a 401, and any other API status.
 *   - `errors-argument-refusal.ts` `installArgumentRefusalReporting`, the walk
 *                                  that routes commander's own refusals here.
 *
 * Nothing imports those paths from outside this package and nothing had to: the
 * 634 call sites that name `./errors` are unchanged, and this file is why.
 */

export { CliArgumentError } from "./cli-argument-error";
export { installArgumentRefusalReporting } from "./errors-argument-refusal";
export { printFailure } from "./errors-document";
export type { FailureCause } from "./errors-failure-cause";
export { handleError } from "./errors-handle";
export {
  CLI_HANDSHAKE_EXPIRED,
  CLI_HANDSHAKE_PENDING,
  CLI_INVALID_ARGUMENTS,
  CLI_MCP_DISCOVERY_FAILED,
  CLI_MCP_DISCOVERY_NOT_QUEUED,
  CLI_MINTED_CODES,
  CLI_NODE_TEST_NOT_MEASURED,
  CLI_OUTCOME_NOT_LISTED,
  CLI_RUN_CANCELLED,
  CLI_RUN_UNFINISHED,
  CLI_UPGRADE_NOT_RESOLVED,
  CLI_UPGRADE_NOT_VERIFIED_FOR_YOU
} from "./errors-published-codes";
export { failure, invalidInput, printNotFound, refuse, reportFailure } from "./errors-report";
