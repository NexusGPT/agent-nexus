import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printList } from "../../output";
import { getPaginationParams } from "../../util/pagination";

/**
 * `nexus phone-number list`
 *
 * NOT bound to a contract — see the note beside the registration calls in
 * `commands/phone-number.ts`.
 */
export function registerPhoneNumberListCommand(phoneNumber: Command, program: Command): void {
  phoneNumber
    .command("list")
    .description("List your organization's ACTIVE phone numbers")
    .option("--search <query>", "Search by number or friendly name")
    // Declared here rather than through addPaginationOptions so the cap can be
    // stated; see the same note on `deployment list`.
    .option("--page <number>", "Page number (default 1)", parseInt)
    .option("--limit <number>", "Items per page — 1-100, default 20", parseInt)
    .addHelpText(
      "after",
      `
Examples:
  $ nexus phone-number list
  $ nexus phone-number list --limit 50
  $ nexus phone-number list --search 415 --json

Notes:
  ACTIVE NUMBERS ONLY. A released number is not listed and there is no flag to
  see one — an absent number means released or never owned, and the two are
  indistinguishable from here.
  The ID column is what "phone-number get" and "phone-number release" take,
  and what a deployment binds with phoneNumberId. It is not the number.
  PRICE is what this organization is charged monthly for that number, as it
  was recorded at purchase.
  --limit above 100 is a 400, not a clamp. Page with meta.paging in --json.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { data, meta } = await client.phoneNumbers.list({
          ...getPaginationParams(opts),
          search: opts.search
        });

        printList(data, meta, [
          { key: "id", label: "ID", width: 36 },
          { key: "number", label: "NUMBER", width: 18 },
          { key: "friendlyName", label: "NAME", width: 20 },
          { key: "countryCode", label: "COUNTRY", width: 10 },
          { key: "price", label: "PRICE", width: 10 },
          { key: "region", label: "REGION", width: 8 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
