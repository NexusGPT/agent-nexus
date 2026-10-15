import { Command } from "commander";

import { registerCustomerCreateCommand } from "./customer/create.command";
import { registerCustomerDeleteCommand } from "./customer/delete.command";
import { registerCustomerGetCommand } from "./customer/get.command";
import { registerCustomerGetByExternalIdCommand } from "./customer/get-by-external-id.command";
import { registerCustomerListCommand } from "./customer/list.command";
import { registerCustomerNoteCommand } from "./customer/note.command";
import { registerCustomerUpdateCommand } from "./customer/update.command";

export function registerCustomerCommands(program: Command): void {
  const customer = program.command("customer").description("Manage CRM customers");

  customer.addHelpText(
    "after",
    `
FOUR ENVELOPES IN ONE NAMESPACE, under --json:
  list                     {data: [...], meta: {total, page, paging}}
  get, get-by-external-id  one FLAT object, with no data key around it
  create, update, note     {success, message, id, ...} — an acknowledgement
  delete                   {success, message, id} — the server's own
                           {deleted: true} is dropped before you see it

So one jq expression cannot read all four. A create answers with the id and the
display name and NOTHING ELSE: none of tags, customFields or the channel
identities it just seeded comes back, so a --body field that never landed and
one that did print the same keys. Read the stored row back with
"nexus customer get <id> --json".

A CUSTOMER IS A PERSON PLUS THEIR CHANNEL IDENTITIES. The identities are what
join a CRM row to the conversations it had, and only "customer get" and
"customer get-by-external-id" return them.`
  );

  registerCustomerListCommand(customer, program);
  registerCustomerGetCommand(customer, program);
  registerCustomerGetByExternalIdCommand(customer, program);
  registerCustomerCreateCommand(customer, program);
  registerCustomerUpdateCommand(customer, program);
  registerCustomerNoteCommand(customer, program);
  registerCustomerDeleteCommand(customer, program);
}
