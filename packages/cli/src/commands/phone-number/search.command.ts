import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { handleError } from "../../errors";
import { printTable } from "../../output";
import {
  PHONE_NUMBER_SEARCH_AVAILABLE__PARAMS_TYPE,
  PHONE_NUMBER_SEARCH_AVAILABLE_CONTRACT
} from "../phone-number.contract.generated";
import { SEARCH_NOTES } from "./copy/search-notes";

/** `nexus phone-number search` */
export function registerPhoneNumberSearchCommand(phoneNumber: Command, program: Command): void {
  const search = phoneNumber
    .command("search")
    .description("Search available phone numbers for purchase")
    .requiredOption("--country <code>", "ISO country code (e.g. US, GB, BE)")
    .addOption(
      enumOption(
        "--type <type>",
        "Number type",
        PHONE_NUMBER_SEARCH_AVAILABLE__PARAMS_TYPE
      ).default("local")
    )
    .option("--sms", "Require SMS capability")
    .option("--mms", "Require MMS capability")
    .option("--voice", "Require voice capability")
    .option("--area-code <code>", "Filter by area code (digits only, US/CA)")
    .option("--limit <n>", "Maximum candidates to return (default 5, max 50)")
    .addHelpText("after", SEARCH_NOTES)
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.phoneNumbers.searchAvailable({
          country: opts.country,
          type: opts.type,
          sms: opts.sms ?? false,
          mms: opts.mms ?? false,
          voice: opts.voice ?? false,
          areaCode: opts.areaCode,
          limit: opts.limit === undefined ? undefined : Number(opts.limit)
        });
        printTable(result, [
          { key: "phoneNumber", label: "PHONE NUMBER", width: 20 },
          { key: "friendlyName", label: "FRIENDLY NAME", width: 25 },
          { key: "price", label: "PRICE", width: 10 },
          { key: "currency", label: "CURRENCY", width: 10 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists. `search` is the only contract-bound
  // verb in this namespace — see the note in `commands/phone-number.ts`.
  bindCommand(search, PHONE_NUMBER_SEARCH_AVAILABLE_CONTRACT);
}
