import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";
import { CUSTOMER_DELETE_CONTRACT } from "../customer.contract.generated";

const DELETE_HELP = `
Examples:
  $ nexus customer delete 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13
  $ nexus customer delete 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --yes

Notes:
  THE CONVERSATIONS SURVIVE; THE CRM ROW AND ITS IDENTITIES DO NOT. One
  transaction unlinks every deployment session — customerId and
  customerIdentityId set to null, the session and its messages left in place —
  then deletes the customer row, taking its identities with it by cascade. The
  history stays readable and stops being attributable to a person.
  A GROUP CONVERSATION LOSES THE PARTICIPANT ROW TOO. A session participant
  hangs off the identity, so it cascades away while the messages remain.
  THE NOTES, TAGS AND customFields GO WITH THE ROW. They live in the customer's
  own metadata column, nothing copies them anywhere, and there is no undo and no
  export. Run "customer get <id> --json" first if any of it matters.
  --yes IS REQUIRED IN A SCRIPT. With no terminal to answer on, this REFUSES
  and exits non-zero rather than acting.`;

/** `nexus customer delete` */
export function registerCustomerDeleteCommand(customer: Command, program: Command): void {
  const del = confirmable(customer.command("delete"))
    .description("Delete a customer")
    .argument("<id>", "Customer ID")
    .addHelpText("after", DELETE_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        if (!(await confirmDestructive(`Delete customer ${id}?`, opts))) return;
        await client.customers.delete(id);
        printSuccess("Customer deleted.", { id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  bindCommand(del, CUSTOMER_DELETE_CONTRACT);
}
