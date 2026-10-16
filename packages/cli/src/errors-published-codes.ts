import { CLI_CODES } from "./errors-cli-codes";

/**
 * THE MEMBERS OF {@link CLI_CODES} OTHER MODULES NAME, AND WHY EACH IS ITS OWN.
 *
 * `CLI_CODES` is the declaration; this file is its published surface. A code
 * appears here because some call site stamps it directly — through
 * `printFailure`, or as the `code` on a `CategorizedCliError` — rather than
 * receiving it from a {@link import("./errors-failure-cause").FailureCause}. The
 * reasoning for each is kept beside the export, because the question a reader
 * arrives with is "why is this not just a `FailureCause`", and the answer is
 * different every time.
 */

/**
 * EVERY CODE THIS CLI MINTS, DERIVED FROM {@link CLI_CODES} RATHER THAN RETYPED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A HAND-KEPT SECOND COPY OF THIS LIST GOES WRONG SILENTLY, AND IT ALREADY HAD.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `json-one-document.scan.ts` asks "is this a code the CLI mints" to tell a real
 * refusal from a typo, once against a hand-written set that silently lacked both
 * `CLI_UPGRADE_*` codes — a miss that surfaces only when a NEW code is drivable,
 * reporting a correct document as a defect for the lane that adds one.
 *
 * Reading the declaration cannot drift from it. The scan unions this with the
 * admin tree's own code (`util/admin-errors.handle.ts`, deliberately not in `CLI_CODES`)
 * in one visible line.
 */
export const CLI_MINTED_CODES: ReadonlySet<string> = new Set(Object.values(CLI_CODES));

/**
 * THE CODE THAT MEANS NOTHING WAS SENT.
 *
 * Exported because `exit-codes.ts` cannot answer the question it looks like it
 * answers. `invalid-input` (5) is reached from TWO places: `refuse`, where the
 * CLI declined before opening a socket, and `exitCodeForHttpStatus`, where the
 * server returned 400, 409 or 422 to a request that went out and came back. The
 * exit code is identical and the two facts are opposites.
 *
 * A caller that has to tell them apart reads the DOCUMENT's `code`: this value
 * appears only on the first, because the server branch passes the API's own code
 * through. `scripts/id-thread-sweep.ts` is that caller — for it, "the harness
 * failed to supply an input" is a SKIP and "the route refused a complete
 * request" is a FAILURE, and conflating them either way defeats the gate.
 */
export const CLI_INVALID_ARGUMENTS = CLI_CODES.INVALID_ARGUMENTS;

/**
 * The one code with no {@link import("./errors-failure-cause").FailureCause},
 * because it owns its own exit code.
 *
 * Every `FailureCause` maps through `reportFailure`, which returns 1 — correct
 * for all six, and wrong for this one. `nexus upgrade` documents exit 2 for
 * "installed but not resolved" precisely so a caller can tell it apart from
 * "nothing changed", so it goes through `printFailure`, which emits the same
 * document and leaves the verdict to the caller.
 */
export const CLI_UPGRADE_NOT_RESOLVED = CLI_CODES.UPGRADE_NOT_RESOLVED;

/**
 * The upgrade installed and could not be checked for the invoking user.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 IT IS A SEPARATE CODE BECAUSE THE EXIT CODE IS SEPARATE, AND SHARING ONE
 *    UNDOES THE WHOLE POINT OF SPLITTING THE OTHER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus upgrade` exits 3 rather than 2 under `sudo` so a caller can tell an
 * ABSENT measurement from a PATH FINDING. Stamping
 * {@link CLI_UPGRADE_NOT_RESOLVED} on that document hands the `--json` consumer
 * the opposite instruction: that code means "your shell resolves a different
 * copy", whose remedy is a PATH edit — the exact misdiagnosis exit 3 exists to
 * avoid. The two channels would then disagree about the same event, and the
 * machine-readable one would be the wrong half.
 *
 * Same reasoning as the code above: no `FailureCause`, because it owns its own
 * exit code and goes through `printFailure`.
 */
export const CLI_UPGRADE_NOT_VERIFIED_FOR_YOU = CLI_CODES.UPGRADE_NOT_VERIFIED_FOR_YOU;

/**
 * A node test that was dispatched and not measured (`node-test-verdict.ts`), a run
 * that was stopped or has not finished (`run-verdict.ts`), and a mutation outcome
 * this build does not list (`commands/print-unlisted-outcome.ts`).
 *
 * None has a {@link import("./errors-failure-cause").FailureCause}, for the same
 * reason as the two codes above: their exit category is `unmeasured`, and every
 * `FailureCause` maps to a FAILURE. They go through `printFailure`, which emits
 * the document and leaves the verdict to the caller.
 */
export const CLI_NODE_TEST_NOT_MEASURED = CLI_CODES.NODE_TEST_NOT_MEASURED;
export const CLI_RUN_CANCELLED = CLI_CODES.RUN_CANCELLED;
export const CLI_RUN_UNFINISHED = CLI_CODES.RUN_UNFINISHED;
export const CLI_OUTCOME_NOT_LISTED = CLI_CODES.OUTCOME_NOT_LISTED;

/**
 * The two OAuth-handshake outcomes that are not a plain remote failure.
 *
 * Neither has a {@link import("./errors-failure-cause").FailureCause}:
 * `HANDSHAKE_PENDING`'s exit category is `unmeasured`, which no `FailureCause`
 * maps to, and `HANDSHAKE_EXPIRED` shares `remote-error`'s exit code while
 * needing its own `code`. Both go through `printFailure`, which emits the
 * document and leaves the verdict to the caller.
 */
export const CLI_HANDSHAKE_PENDING = CLI_CODES.HANDSHAKE_PENDING;
export const CLI_HANDSHAKE_EXPIRED = CLI_CODES.HANDSHAKE_EXPIRED;

/**
 * The two MCP-discovery outcomes that are not a plain remote failure.
 *
 * Neither has a {@link import("./errors-failure-cause").FailureCause}: both
 * share `remote-error`'s exit code — a discovery that did not happen and one
 * that happened and failed are both failures of the operator's goal — while
 * needing their OWN code, because the remedies are opposite.
 * `MCP_DISCOVERY_NOT_QUEUED` is cured by re-running the command;
 * `MCP_DISCOVERY_FAILED` is cured at the remote, and re-running repeats it. Both
 * go through `printFailure`, which emits the document and leaves the verdict to
 * the caller.
 */
export const CLI_MCP_DISCOVERY_NOT_QUEUED = CLI_CODES.MCP_DISCOVERY_NOT_QUEUED;
export const CLI_MCP_DISCOVERY_FAILED = CLI_CODES.MCP_DISCOVERY_FAILED;
