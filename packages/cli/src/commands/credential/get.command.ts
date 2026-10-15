import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/** `nexus credential get <id>` */
export function registerCredentialGetCommand(credential: Command, program: Command): void {
  credential
    .command("get")
    .description("Get credential details")
    .argument("<id>", "Credential ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus credential get 11111111-1111-4111-8111-111111111111
  $ nexus credential get 11111111-1111-4111-8111-111111111111 --json

Notes:
  SOURCE IS THE FIELD THAT DECIDES WHAT ELSE WORKS, and it is the one printed
  here that nothing on this screen explains. It says which record backs the row —
  oauth_connection, api_key_connection or tool_credential — and it settles two
  separate questions: what "credential delete" has to tear down on the way out,
  and which of name/description "credential update" can actually store. Only
  api_key_connection stores both; see "credential update --help".
  A null description is normal rather than empty: two of the three sources have
  no description column at all, so the field is null for every row backed by one.
  NO SECRET MATERIAL IS RETURNED and none ever will be — this is the inventory
  record, not the token. Use "external-tool test-auth" to find out whether the
  stored credentials still work.
  ACCESS CARDS ARE A SEPARATE READ: "nexus access-card list --credential-id
  <id>". This record does not say how many policies hang off it.
  STATUS is the stored connection state, not a live probe.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const cred = await client.credentials.get(id);
        printRecord(cred, [
          { key: "id", label: "ID" },
          { key: "service", label: "Service" },
          { key: "name", label: "Name" },
          { key: "source", label: "Source" },
          { key: "status", label: "Status" },
          { key: "accountIdentifier", label: "Account" },
          { key: "failureReason", label: "Failure Reason" },
          { key: "description", label: "Description" },
          { key: "createdAt", label: "Created" },
          { key: "updatedAt", label: "Updated" },
          { key: "lastUsedAt", label: "Last Used" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
