import type { UpdateCustomerBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { CUSTOMER_UPDATE_CONTRACT } from "../customer.contract.generated";

const UPDATE_HELP = `
Examples:
  $ nexus customer update 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --display-name "Ada Byron"
  $ nexus customer update 3b1f8e42-5c7a-4d19-9e60-2a4b6c8d0e13 --body '{"tags":["vip","eu"]}'

Notes:
  tags AND customFields ARE REPLACED WHOLE, NEVER MERGED. Sending
  {"customFields":{"tier":"gold"}} deletes every other custom field. Read the
  stored object back with "customer get --json" and send it again with your
  change folded in. An update naming neither key leaves the metadata record
  byte-identical, so the customer's notes are never at risk from this command.
  --body REACHES FOUR FIELDS NO FLAG DOES: tags, customFields, externalUserId
  and avatarUrl. externalUserId has a flag on "create" and none here, so --body
  is the only way to change it afterwards.
  --email AND --phone REWRITE THE SCALAR AND LEAVE THE IDENTITY ALONE. The
  GMAIL / WHATSAPP identity that "customer create" seeded still carries the old
  value, and "customer list --channel" keeps matching on it.
  A key outside the schema is dropped in silence, so a 200 is not evidence the
  field was stored. Read it back.`;

/** `nexus customer update` */
export function registerCustomerUpdateCommand(customer: Command, program: Command): void {
  const update = customer
    .command("update")
    .description("Update a customer")
    .argument("<id>", "Customer ID")
    .option("--display-name <name>", "Display name")
    .option("--email <email>", "Primary email")
    .option("--phone <phone>", "Primary phone")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", UPDATE_HELP)
    .action(async (id: string, opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = {};
        if (opts.displayName) flags.displayName = opts.displayName;
        if (opts.email) flags.primaryEmail = opts.email;
        if (opts.phone) flags.primaryPhone = opts.phone;
        const body = mergeBodyWithFlags(base, flags);
        const c = await client.customers.update(id, asRequestBody<UpdateCustomerBody>(body));
        printSuccess("Customer updated.", { id: c.id });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  bindCommand(update, CUSTOMER_UPDATE_CONTRACT);
}
