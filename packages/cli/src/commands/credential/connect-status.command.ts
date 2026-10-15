import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus credential connect-status <handshake-id>` */
export function registerCredentialConnectStatusCommand(
  credential: Command,
  program: Command
): void {
  credential
    .command("connect-status")
    .description('Poll a connection started by "credential connect"')
    .argument("<handshake-id>", "Handshake ID from the connect response")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus credential connect-status 22222222-2222-4222-8222-222222222222
  $ nexus credential connect-status ctok_dac4453f92a54ae7ac45e23694cc4a78 --json

Notes:
  THE ID IS NOT ALWAYS A UUID. A built-in OAuth handshake id is one; a Pipedream
  connection's is its connect token, "ctok_...". Both are accepted here, and
  nothing else is — this is not a credential id.

  FOUR STATES, AND ONLY ONE OF THEM MEANS KEEP POLLING:
    PENDING    the browser flow has not finished. Poll again.
    COMPLETED  terminal, and connectionId is now set — that is the connection.
    FAILED     terminal. Read errorMessage, and branch on errorCode.
    EXPIRED    terminal. The handshake outlived expiresAt; start again with
               "nexus credential connect".
  There is no timeout here and no retry budget, so the loop is yours to bound —
  expiresAt, returned by "credential connect", is the deadline to bound it with.

  errorCode IS THE FIELD TO BRANCH ON, NEVER errorMessage. It is
  ORG_HAS_NO_MEMBERS, PIPEDREAM_TOOL_NOT_IN_MARKETPLACE or
  PIPEDREAM_INVALID_ACCOUNT, and it is null on PENDING and COMPLETED — and also
  null on a FAILED outcome nobody has classified yet, so a null errorCode beside
  FAILED means "read errorMessage", never "no error".

  connectionId IS null UNTIL COMPLETED. Do not read its absence as a failure
  while status is still PENDING.

  A COMPLETED connection is not yet addressable by connectionId in this
  namespace — find the new row with "nexus credential list", which is the
  unified inventory this id space belongs to.`
    )
    .action(async (handshakeId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.credentials.connectStatus(handshakeId);
        printRecord(result, [
          { key: "status", label: "Status" },
          { key: "connectionId", label: "Connection ID" },
          { key: "errorCode", label: "Error Code" },
          { key: "errorMessage", label: "Error" },
          { key: "expiresAt", label: "Expires At" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
