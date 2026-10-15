import type { WorkspaceUploadBatchResponse } from "@agent-nexus/sdk";

/**
 * One pack's answer, with how many of its failure rows this machine wrote
 * (a file it could not read) rather than the server — the exit category is
 * decided on that split: `remote-error` names the server's verdict,
 * `local-failed` names this machine's, and a `--json` reader keyed on the
 * first must not retry the server for the second.
 */
export interface PackOutcome {
  response: WorkspaceUploadBatchResponse;
  localFailures: number;
}
