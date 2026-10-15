import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printRecord } from "../../output";
import { CUSTOMER_GET_CONTRACT } from "../customer.contract.generated";

const GET_HELP = `
Examples:
  $ nexus customer get 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13
  $ nexus customer get 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --json

Notes:
  identities[] AND recentSessions[] ARE ON THIS READ AND ON NO LIST. A script
  that pages "customer list" reads undefined for both on every row, because the
  list serializes neither. identities is where a channel identity is legible —
  identifier, service, isPrimary, verifiedAt — and it is what joins this CRM row
  to the conversations it had.
  THE TABLE PRINTS SEVEN FIELDS AND THE RESPONSE CARRIES FAR MORE: tags,
  customFields, avatarUrl, organizationId and both arrays are in the payload and
  in no column. Use --json.
  Under --json this is ONE FLAT OBJECT with no data key — see
  "nexus customer --help" for the four envelopes this namespace answers with.`;

/** `nexus customer get` */
export function registerCustomerGetCommand(customer: Command, program: Command): void {
  const get = customer
    .command("get")
    .description("Get customer details")
    .argument("<id>", "Customer ID")
    .addHelpText("after", GET_HELP)
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const c = await client.customers.get(id);
        printRecord(c, [
          { key: "id", label: "ID" },
          { key: "displayName", label: "Name" },
          { key: "primaryEmail", label: "Email" },
          { key: "primaryPhone", label: "Phone" },
          { key: "externalUserId", label: "External User ID" },
          { key: "totalSessions", label: "Sessions" },
          { key: "totalMessages", label: "Messages" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  bindCommand(get, CUSTOMER_GET_CONTRACT);
}
