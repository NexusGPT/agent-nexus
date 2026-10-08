import { CLI_MCP_DISCOVERY_FAILED, CLI_MCP_DISCOVERY_NOT_QUEUED } from "../../errors";
import { EXIT_CODES } from "../../exit-codes";
import type { McpSyncVerdict } from "./sync-verdict";

/**
 * The error DOCUMENT a non-accepted verdict means, and the exit code that goes with it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 IT DESCRIBES AND DOES NOT PRINT, AND THAT IS A GATE'S REQUIREMENT RATHER THAN A
 * PREFERENCE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This was `reportMcpSyncRefusal`, which printed through `printFailure` and returned
 * the code, so the leaf read `process.exitCode = reportMcpSyncRefusal(…)`.
 * `json-error-document.static-scan.test.ts` reported that as a command exiting non-zero
 * with an EMPTY stdout under `--json`, and it was right to: its `emitsDocument` follows
 * DIRECT calls only and says so — *"a HELPER that emits a document is not followed here
 * … That errs toward REPORTING, which is the direction a gate should err in."*
 * `createClient` can write prose to stderr on the way, so the pairing it watches for
 * was complete, and `STATIC_CEILING` is 0 with no ledger to join.
 *
 * `DOCUMENT_EMITTERS` does bless three such helpers by hand. This is deliberately not a
 * fourth: each of those is *"shared by TWO commands precisely so the two cannot drift
 * apart about what one response means"*, and this one serves a single leaf — so the
 * justification for a blessing does not apply, and the table demands a behavioural
 * assertion behind every blessing. Returning a descriptor costs nothing and makes the
 * document emission VISIBLE at the exit, which is that gate's whole point.
 *
 * ⚠️ IT IS ALSO NOT `reportFailure(cause, …)`, WHICH IS WHAT THE GATE'S MESSAGE
 * PRESCRIBES. That remedy is writable and it costs the thing the previous fix was
 * about: `reportFailure` emits `FAILURE_CAUSE_CODES[cause]`, so both arms would
 * collapse into `CLI_REMOTE_ERROR` and a `--json` consumer would lose the one field
 * separating "nothing was queued, re-run" from "a discovery ran and the remote lost,
 * do not re-run". `refuse` is wrong for a second reason: the invocation was accepted.
 *
 * ✅ The pure-function shape is the second gain: the verdict -> document mapping is
 * assertable without spying on stdout, and `sync.outcomes-are-classified.test.ts` pins
 * each arm's `code`.
 */
export interface McpSyncRefusal {
  readonly message: string;
  readonly code: string;
  readonly hint: string;
  readonly exitCode: number;
}

/**
 * Every arm shares `remote-error`'s exit code — the request was accepted and the answer
 * reports that the operator's goal did not happen — and carries its OWN `code`, so a
 * `--json` consumer branches on a field rather than on prose.
 */
export function describeMcpSyncRefusal(
  verdict: McpSyncVerdict,
  displayName: string,
  serverId: string
): McpSyncRefusal {
  const exitCode = EXIT_CODES["remote-error"];

  if (verdict.outcome === "not-queued") {
    return {
      message: `No discovery was queued for "${displayName}" — the job queue refused the request.`,
      code: CLI_MCP_DISCOVERY_NOT_QUEUED,
      hint:
        "Nothing was dialled and nothing is coming. Re-running this command is the remedy; " +
        "if it keeps refusing, the queue itself is the problem.",
      exitCode
    };
  }

  if (verdict.outcome === "ran-and-failed") {
    return {
      message:
        `A discovery RAN for "${displayName}" and the server could not be read: ` +
        `${verdict.errorCode}.`,
      code: CLI_MCP_DISCOVERY_FAILED,
      hint:
        "The request was queued and a worker dialled the remote, so re-running this " +
        "command repeats it rather than fixing it. AUTHORIZATION_REQUIRED needs the " +
        "server reconnected; TIMEOUT and UNREACHABLE are the remote or the network. " +
        `Read the recorded state with "nexus mcp-server get ${serverId}".`,
      exitCode
    };
  }

  return {
    message:
      `The server answered with lastSyncOutcome ${verdict.outcome === "unlisted" ? verdict.reported : "an accepted value"}, ` +
      `which this release does not list.`,
    code: CLI_MCP_DISCOVERY_FAILED,
    hint: `Upgrade the CLI, and read the row as it stands with "nexus mcp-server get ${serverId}".`,
    exitCode
  };
}
