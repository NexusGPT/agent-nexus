import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord, printSuccess } from "../../output";
import { confirmable, confirmDestructive } from "../../util/confirm";
import { BUY_NOTES } from "./copy/buy-notes";

/**
 * `nexus phone-number buy` — THIS SPENDS MONEY. Why it is gated, and why the
 * gate is not written here, is in the header of `commands/phone-number.ts`.
 *
 * NOT bound to a contract: no v1 contract descriptor is declared for the
 * purchase route.
 */
export function registerPhoneNumberBuyCommand(phoneNumber: Command, program: Command): void {
  confirmable(phoneNumber.command("buy"))
    .description("Purchase a phone number — THIS SPENDS MONEY and bills monthly")
    .requiredOption("--phone-number <number>", "Phone number to buy (E.164 format)")
    .requiredOption("--country <code>", "ISO country code")
    .requiredOption(
      "--price <price>",
      "Monthly price from the search result — THIS IS THE AMOUNT DEBITED"
    )
    .option("--connection-id <id>", "ApiKeyConnection ID for subaccount purchase")
    .addHelpText("after", BUY_NOTES)
    .action(async (opts) => {
      try {
        if (
          !(await confirmDestructive(
            `Buy ${opts.phoneNumber} for ${opts.price}/month? This bills until released.`,
            opts
          ))
        ) {
          return;
        }

        const client = createClient(program.optsWithGlobals());
        const result = await client.phoneNumbers.buy({
          phoneNumber: opts.phoneNumber,
          country: opts.country,
          price: opts.price,
          connectionId: opts.connectionId
        });
        printRecord(result, [
          { key: "id", label: "ID" },
          { key: "number", label: "Number" },
          { key: "friendlyName", label: "Friendly Name" },
          { key: "countryCode", label: "Country" },
          { key: "price", label: "Price" },
          { key: "region", label: "Region" }
        ]);
        printSuccess("Phone number purchased successfully");
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
