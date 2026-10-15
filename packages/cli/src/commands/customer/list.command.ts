import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { addPaginationOptions, getPaginationParams } from "../../util/pagination";
import {
  CUSTOMER_LIST__PARAMS_CHANNEL,
  CUSTOMER_LIST__PARAMS_SORT_BY,
  CUSTOMER_LIST__PARAMS_SORT_ORDER,
  CUSTOMER_LIST_CONTRACT
} from "../customer.contract.generated";

const LIST_HELP = `
Examples:
  $ nexus customer list
  $ nexus customer list --search "john@example.com" --json
  $ nexus customer list --tag vip --limit 50
  $ nexus customer list --channel WHATSAPP --sort-by totalMessages --sort-order desc

Notes:
  --tag IS THE READ SIDE OF "customer update". Tags are WRITTEN with
  "nexus customer update <id> --body '{"tags":["vip"]}'" and read back here.
  Before this flag existed a tag could be written and never filtered by.
  ONE TAG, MATCHED EXACTLY. There is no multi-tag form, no OR, and no partial
  match: the filter asks whether the customer's tag array CONTAINS this exact
  string, so "vip" does not match "VIP" and does not match "vip-eu".

  --sort-by, --sort-order and --channel are validated LOCALLY against the
  contract, so a bad value is refused here and never becomes a 400. --tag is
  NOT — any string is accepted, and a tag nobody carries is an empty list rather
  than an error.
  --sort-by defaults to lastSeenAt and --sort-order to desc. Both defaults live
  on the SERVER, so unset the CLI sends neither.
  --channel MATCHES A CUSTOMER'S IDENTITIES, not their messages: it keeps a
  customer who has an identity on that channel, whatever channel they last
  spoke on.`;

/** `nexus customer list` */
export function registerCustomerListCommand(customer: Command, program: Command): void {
  const list = addPaginationOptions(
    customer
      .command("list")
      .description("List customers")
      .option("--search <query>", "Search by name, email, or phone")
      .option("--tag <tag>", "Keep only customers carrying this tag")
      .addOption(enumOption("--sort-by <field>", "Sort by field", CUSTOMER_LIST__PARAMS_SORT_BY))
      .addOption(
        enumOption("--sort-order <dir>", "Sort direction", CUSTOMER_LIST__PARAMS_SORT_ORDER)
      )
      .addOption(
        enumOption(
          "--channel <channel>",
          "Keep only customers with an identity on this channel",
          CUSTOMER_LIST__PARAMS_CHANNEL
        )
      )
      .addHelpText("after", LIST_HELP)
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.customers.list({
        ...getPaginationParams(opts),
        search: opts.search,
        tag: opts.tag,
        sortBy: opts.sortBy,
        sortOrder: opts.sortOrder,
        channel: opts.channel
      });
      printList(data, meta, [
        { key: "id", label: "ID", width: 36 },
        { key: "displayName", label: "NAME", width: 25 },
        { key: "primaryEmail", label: "EMAIL", width: 30 },
        { key: "primaryPhone", label: "PHONE", width: 15 }
      ]);
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // Bound LAST, after every option and positional exists — see `bindCommand`.
  //
  // `list` WAS absent: its sortBy, sortOrder and channel are query parameters
  // and this GET leaf has no `--body` to reach them through. The three flags
  // were added rather than deferred, which is what unblocked the descriptor.
  //
  // The adapter behind this route keeps its OWN allowlist of sort fields and
  // silently falls back to lastSeenAt on a miss, so an unvalidated --sort-by
  // did not even 400 — it returned a differently-ordered page with nothing
  // saying the sort had been ignored. That is the failure this binding removes.
  bindCommand(list, CUSTOMER_LIST_CONTRACT);
}
