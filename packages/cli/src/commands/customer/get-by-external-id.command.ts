import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError, printNotFound } from "../../errors";
import { printRecord } from "../../output";
import { CUSTOMER_GET_BY_EXTERNAL_ID_CONTRACT } from "../customer.contract.generated";

const GET_BY_EXTERNAL_ID_HELP = `
Examples:
  $ nexus customer get-by-external-id crm-4471
  $ nexus customer get-by-external-id crm-4471 --json

Notes:
  A MISS IS A 200 ON THE WIRE AND A NON-ZERO EXIT HERE. The route answers
  data: null rather than 404; this command turns that into an error document on
  STDERR and exits non-zero, leaving STDOUT EMPTY. So read the exit code — empty
  stdout is the miss, never a truncated document. "nexus --help" carries the
  table, and a miss is the not-found category rather than a generic failure.
  THE LOOKUP IS EXACT, CASE-SENSITIVE AND TRIMMED, and at most one customer per
  organization can hold a given external user id. A blank or whitespace-only key
  is a 400 rather than a miss.
  IT PRINTS EVERY FIELD, where "customer get" prints seven labelled ones —
  identities[] and recentSessions[] included. Both arrays carry the same content
  "customer get" returns, and recentSessions[] holds the 20 most recent.
  Set the id at create time with --external-user-id. "customer update" reaches
  it only through --body.`;

/** `nexus customer get-by-external-id` */
export function registerCustomerGetByExternalIdCommand(customer: Command, program: Command): void {
  const getByExternalId = customer
    .command("get-by-external-id")
    .description("Find customer by external user ID")
    .argument("<external-user-id>", "External user ID")
    .addHelpText("after", GET_BY_EXTERNAL_ID_HELP)
    .action(async (externalUserId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const c = await client.customers.getByExternalId(externalUserId);
        if (!c) {
          // A miss here is a 200 with an empty body, not a 404, so handleError
          // never sees it. printNotFound is what keeps it a FAILURE on both
          // channels — one JSON error document under --json, exit 1 either way.
          process.exitCode = printNotFound(
            `No customer with external user ID "${externalUserId}".`,
            'Run "nexus customer list --search <term>" to find the customer, then use its external user ID.'
          );
          return;
        }
        printRecord(c);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  bindCommand(getByExternalId, CUSTOMER_GET_BY_EXTERNAL_ID_CONTRACT);
}
