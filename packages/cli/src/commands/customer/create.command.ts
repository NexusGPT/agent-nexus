import type { CreateCustomerBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { CUSTOMER_CREATE_CONTRACT } from "../customer.contract.generated";

const CREATE_HELP = `
Examples:
  $ nexus customer create --display-name "Ada Lovelace"
  $ nexus customer create --display-name "Ada" --email ada@example.com
  $ nexus customer create --body '{"displayName":"Ada","tags":["vip"]}'

Notes:
  --email AND --phone EACH CREATE A CHANNEL IDENTITY, not merely a field. The
  email is stored as a GMAIL identity and the phone as a WHATSAPP one, both
  isPrimary and both verifiedAt null, whatever channel the person really uses.
  That identity is what makes "customer list --channel GMAIL" match them.
  AN IDENTITY IS UNIQUE PER ORGANIZATION AND SERVICE. An email or phone another
  customer here already holds fails the WHOLE create with 409 and leaves no
  partial row — the customer and both identities are one transaction. The same
  number held as a TWILIO_SMS identity does not collide, because the service is
  part of the key.
  "customer update" NEVER REVISITS THOSE IDENTITIES. It rewrites the scalar
  column only, so an email changed later leaves the GMAIL identity pointing at
  the old address. Create with the address you mean.
  --body REACHES TWO FIELDS NO FLAG DOES: tags (array of strings) and
  customFields (any object). A flag wins over the same key in --body, and a key
  outside the schema is dropped in silence, so a 200 is not evidence it landed.
  --display-name may come from --body as "displayName" instead of the flag.`;

/** `nexus customer create` */
export function registerCustomerCreateCommand(customer: Command, program: Command): void {
  const create = customer
    .command("create")
    .description("Create a customer")
    .requiredOption("--display-name <name>", "Customer display name")
    .option("--external-user-id <id>", "External user ID")
    .option("--email <email>", "Primary email")
    .option("--phone <phone>", "Primary phone")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", CREATE_HELP)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const base = await resolveBody(opts.body);
        const flags: Record<string, unknown> = { displayName: opts.displayName };
        if (opts.externalUserId) flags.externalUserId = opts.externalUserId;
        if (opts.email) flags.primaryEmail = opts.email;
        if (opts.phone) flags.primaryPhone = opts.phone;
        const body = mergeBodyWithFlags(base, flags);
        const c = await client.customers.create(asRequestBody<CreateCustomerBody>(body));
        printSuccess("Customer created.", {
          id: c.id,
          displayName: c.displayName
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  bindCommand(create, CUSTOMER_CREATE_CONTRACT);
}
