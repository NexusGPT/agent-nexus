/**
 * Codes the CLI mints for failures that never reached the API.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `CLI_*` MEANS "THIS NEVER REACHED THE SERVER". EVERY OTHER CODE CAME FROM IT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The prefix is the whole provenance rule, and it is what lets `code` be REQUIRED
 * without lying. An API code is passed through verbatim; anything the CLI decided
 * on its own is named here. A reader branching on `code` can therefore tell "the
 * server refused this" from "we never got there" without a second field, and a
 * future server-side code can never collide with one of these.
 *
 * THIS MODULE IMPORTS NOTHING, which is why it is the declaration's home: the
 * vocabulary is the one part of the error layer a module can read without
 * pulling in the reporting layer behind it. The members other modules name one
 * by one are published from `errors-published-codes.ts`.
 */
export const CLI_CODES = {
  /** The CLI stopped waiting. The server may still be completing the request. */
  TIMEOUT: "CLI_TIMEOUT",
  /** The API was unreachable — DNS, TLS, socket, offline. */
  CONNECTION_FAILED: "CLI_CONNECTION_FAILED",
  /** An SDK-level failure carrying no API code. */
  SDK_ERROR: "CLI_SDK_ERROR",
  /** Anything else that escaped to the top of a command. */
  UNKNOWN: "CLI_UNKNOWN_ERROR",
  /** A 2xx that means "absent" — see `printNotFound` in `errors-report.ts`. */
  NOT_FOUND: "CLI_NOT_FOUND",
  /**
   * The invocation was refused before anything was sent — a missing required
   * option, an unknown flag, a value outside a `.choices()` set, a bad
   * positional. See `CliArgumentError` and `refuse` in `errors-report.ts`.
   */
  INVALID_ARGUMENTS: "CLI_INVALID_ARGUMENTS",
  /** No usable credential, or the credential was rejected. Run `auth login`. */
  NOT_AUTHENTICATED: "CLI_NOT_AUTHENTICATED",
  /**
   * `NEXUS_ENV` names an environment this CLI has no hosts for. Separate from
   * {@link CLI_CODES.INVALID_ARGUMENTS} because nothing about the invocation is
   * wrong — a script told its ARGUMENTS were refused inspects its argv, and the
   * offending value is in the environment. `config-env-resolve.ts` spells it
   * literally, as `config-profile-lookup.ts` does `CLI_NOT_AUTHENTICATED`: those
   * two strings are the config layer's only contact with this vocabulary, and it
   * reaches no part of the reporting layer.
   */
  UNKNOWN_NEXUS_ENV: "CLI_UNKNOWN_NEXUS_ENV",
  /**
   * The request COMPLETED and the answer reports a failure carrying no API code
   * of its own — a non-2xx from a raw `fetch`, or a 2xx whose body says it
   * failed. Distinct from {@link CLI_CODES.CONNECTION_FAILED}, which is
   * retryable, and from {@link CLI_CODES.SDK_ERROR}, which came through the SDK.
   */
  REMOTE_ERROR: "CLI_REMOTE_ERROR",
  /**
   * A local operation this CLI performed failed — an install, a config write, a
   * file write. Nothing about the caller's input is wrong and no retry against
   * the API will help.
   */
  LOCAL_FAILED: "CLI_LOCAL_FAILED",
  /** Ctrl-C at a question (an install prompt): nothing failed, it exits the shell's `130`. */
  INTERRUPTED: "CLI_INTERRUPTED",
  /**
   * A global install SUCCEEDED and the shell still resolves a different copy.
   *
   * Deliberately not {@link CLI_CODES.LOCAL_FAILED}: nothing failed. The bytes
   * are on disk exactly where the package manager was asked to put them, and
   * the machine changed. What did not happen is the OUTCOME the caller wanted,
   * and the remedy is a PATH edit rather than a retry — the opposite advice a
   * `LOCAL_FAILED` reader would follow.
   */
  UPGRADE_NOT_RESOLVED: "CLI_UPGRADE_NOT_RESOLVED",
  UPGRADE_NOT_VERIFIED_FOR_YOU: "CLI_UPGRADE_NOT_VERIFIED_FOR_YOU",
  /**
   * A single-node test was DISPATCHED and its outcome is not in the response.
   *
   * Deliberately not {@link CLI_CODES.REMOTE_ERROR}: nothing failed. The node
   * type runs in the background, so `data` is `null` and there is no verdict to
   * report — the `unmeasured` exit category, whose whole reason for existing is
   * that a check nobody could run is neither a pass nor a failure. A consumer
   * branching on `CLI_REMOTE_ERROR` here would go and debug a node that has not
   * yet run.
   */
  NODE_TEST_NOT_MEASURED: "CLI_NODE_TEST_NOT_MEASURED",
  /**
   * A workflow run was STOPPED before the platform could judge it.
   *
   * Deliberately not {@link CLI_CODES.REMOTE_ERROR}: nothing failed. A cancelled
   * run may have done everything, nothing, or half of it, and the platform never
   * reached a verdict — the `unmeasured` exit category. A consumer branching on
   * a failure code here would go and debug a workflow that was never given the
   * chance to be wrong.
   */
  RUN_CANCELLED: "CLI_RUN_CANCELLED",
  /**
   * A workflow run has NOT FINISHED — `PENDING`, `RUNNING`, or a status this
   * build does not know.
   *
   * Separate from {@link CLI_CODES.RUN_CANCELLED} even though both exit
   * `unmeasured`, because the reader's next move differs: one run is over and
   * one is not. Waiting helps here and never helps there.
   */
  RUN_UNFINISHED: "CLI_RUN_UNFINISHED",
  /**
   * An OAuth handshake has not finished. The browser flow is still open.
   *
   * Deliberately not a failure code: nothing failed and nothing passed, so the
   * exit category is `unmeasured`. `tool connection-status`'s own help calls
   * PENDING the one state that means keep polling — a loop that treated it as a
   * failure would abandon a handshake that is about to succeed.
   */
  HANDSHAKE_PENDING: "CLI_HANDSHAKE_PENDING",
  /**
   * An OAuth handshake outlived its `expiresAt` without completing.
   *
   * Terminal, and separate from a plain {@link CLI_CODES.REMOTE_ERROR} because
   * the remedy differs: a FAILED handshake is diagnosed from its `errorCode`,
   * and an EXPIRED one can only be replaced by a new one from
   * `nexus tool connect`. Both exit `remote-error`; only the code says which.
   */
  HANDSHAKE_EXPIRED: "CLI_HANDSHAKE_EXPIRED",
  /** A mutation answered with an outcome kind this build does not list — `unmeasured`. */
  OUTCOME_NOT_LISTED: "CLI_OUTCOME_NOT_LISTED",
  /**
   * `mcp-server sync` asked for a discovery and the job queue REFUSED it.
   *
   * Terminal, and the one state where RE-RUNNING the command is the remedy:
   * nothing was queued, so nothing is coming, and the server's row says FAILED +
   * `DISCOVERY_NOT_QUEUED` for ever until somebody asks again.
   */
  MCP_DISCOVERY_NOT_QUEUED: "CLI_MCP_DISCOVERY_NOT_QUEUED",
  /**
   * `mcp-server sync` read a row whose discovery RAN and whose remote failed.
   *
   * 🔴 SEPARATE FROM {@link CLI_CODES.MCP_DISCOVERY_NOT_QUEUED} BECAUSE THE TWO ARE
   * OPPOSITE FACTS AND HAD ONE CODE. Both are `lastSyncOutcome: FAILED`; only
   * `lastSyncErrorCode` separates them. `DISCOVERY_NOT_QUEUED` means no discovery
   * happened; `TIMEOUT`, `UNREACHABLE`, `AUTHORIZATION_REQUIRED` and
   * `INVALID_TOOL_LIST` mean one DID, against the remote, and lost. Re-running the
   * command cures the first and repeats the second — so a script that cannot tell
   * them apart retries work that already ran, and waits for it.
   *
   * It shares `remote-error`'s exit code, exactly as {@link CLI_CODES.HANDSHAKE_EXPIRED}
   * shares it with a FAILED handshake. Only the code says which.
   */
  MCP_DISCOVERY_FAILED: "CLI_MCP_DISCOVERY_FAILED"
} as const;
