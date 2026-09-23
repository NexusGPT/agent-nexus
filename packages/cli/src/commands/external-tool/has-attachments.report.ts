import { NexusApiError } from "@agent-nexus/sdk";

import { printFailure } from "../../errors";
import { EXIT_CODES } from "../../exit-codes";
import type { ToolHasAttachmentsDetails } from "../../external-tool-wire-types";

/**
 * The API's OWN code for the 409 this module special-cases.
 *
 * ⚠️ NAMED ONCE, BECAUSE THE EXTRACTOR AND THE REPORTER MUST AGREE. The
 * extractor matches on the code and the reporter puts it on the wire; two
 * literals would let a rename move one and not the other, and the document
 * would then carry a code the CLI never actually matched.
 */
const TOOL_HAS_ATTACHMENTS = "TOOL_HAS_ATTACHMENTS";

export function extractToolHasAttachmentsDetails(err: unknown): ToolHasAttachmentsDetails | null {
  if (!(err instanceof NexusApiError)) return null;
  if (err.status !== 409 || err.code !== TOOL_HAS_ATTACHMENTS) return null;
  return (err.details as ToolHasAttachmentsDetails) ?? null;
}

/**
 * The 409 from the "has attachments" guard, as ONE error document.
 *
 * ⚠️ THE SAMPLE LIST HAS TO RIDE INSIDE `message`, NOT BESIDE IT ON STDERR.
 * This printed the whole list with `console.error` and left the caller to set
 * `process.exitCode = 1`, so under `--json` the command exited non-zero with an
 * EMPTY stdout — a caller could not tell "already deleted" from "still
 * attached" by shape OR by status, which is the one combination no script works
 * around.
 *
 * 🚨 THE CODE IS THE SERVER'S, NOT A `CLI_*` ONE. A `CLI_*` code means the
 * request never reached the API — that is the whole provenance rule — so
 * `reportFailure("remote-error", …)` here would stamp `CLI_REMOTE_ERROR` on a
 * 409 the server deliberately raised, throw away the actionable
 * `TOOL_HAS_ATTACHMENTS`, and tell a script branching on `code` that a refusal
 * it can act on was a client-side transport failure it cannot. `handleError`'s
 * own 409 branch has always used `err.code`; this is the same rule, kept at a
 * call site that special-cases the SAME status for a richer message.
 *
 * `printFailure` is the verb for that: a document with a REQUIRED explicit code
 * and no opinion about the exit code. Returning the code keeps the document and
 * the status in one statement at the call site.
 */
export function reportToolHasAttachments({ total, sample }: ToolHasAttachmentsDetails): number {
  const lines = sample.map((a) => `  • ${a.label}  (agent: ${a.agentName})`);
  if (total > sample.length) {
    lines.push(`  • … and ${total - sample.length} more`);
  }

  printFailure(
    `Cannot delete: ${total} agent tool config(s) reference this external tool:\n${lines.join("\n")}`,
    TOOL_HAS_ATTACHMENTS,
    "Re-run with --force to cascade-delete the references along with the tool."
  );
  // The request conflicts with state that exists — the same category HTTP 409
  // lands in. It returned a bare 1 before the taxonomy existed.
  return EXIT_CODES["invalid-input"];
}
