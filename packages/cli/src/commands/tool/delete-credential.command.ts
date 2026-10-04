import { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";

/** `nexus tool delete-credential` — revoke at the provider, then drop the row. */
export function registerToolDeleteCredentialCommand(tool: Command, program: Command): void {
  confirmable(tool.command("delete-credential"))
    .description("Delete a tool credential")
    .argument("<tool-id>", "Tool ID")
    .argument("<credential-id>", "Credential ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus tool delete-credential 11111111-1111-4111-8111-111111111111 44444444-4444-4444-8444-444444444444
  $ nexus tool delete-credential 11111111-1111-4111-8111-111111111111 44444444-4444-4444-8444-444444444444 --yes

Notes:
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.

  IT REVOKES AT THE PROVIDER BEFORE IT DROPS THE ROW, AND A REFUSED REVOCATION
  ABORTS THE WHOLE DELETE. For a Pipedream-backed credential the connected
  account is revoked first; if the provider refuses, nothing is removed and the
  credential still works. That error means "try again", not "half-deleted".

  DELETING A CREDENTIAL TAKES ITS ACCESS CARDS WITH IT. Every card written
  against it goes too, including hand-written non-master ones. Agent tool
  configs and workflow nodes naming this credential are NOT updated and NOT
  warned about — they keep pointing at the dropped row and fail later, somewhere
  else, as an orphaned-credential error. List what depends on it before you
  delete, not after something breaks.`
    )
    .action(async (toolId: string, credentialId: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());

        if (!(await confirmDestructive(`Delete credential ${credentialId}?`, opts))) return;

        await client.toolConnection.deleteCredential(toolId, credentialId);
        printSuccess("Credential deleted.", { toolId, credentialId });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
