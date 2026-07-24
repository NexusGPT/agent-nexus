import { Command } from "commander";

import { createClient } from "../client";
import { handleError } from "../errors";
import { printList, printRecord, printSuccess, printTable } from "../output";
import { addPaginationOptions, getPaginationParams } from "../util/pagination";

export function registerPhoneNumberCommands(program: Command): void {
  const phoneNumber = program
    .command("phone-number")
    .description("Search, buy, and manage phone numbers for SMS/Voice deployments");

  // ── search ──────────────────────────────────────────────────────────
  phoneNumber
    .command("search")
    .description("Search available phone numbers for purchase")
    .requiredOption("--country <code>", "ISO country code (e.g. US, GB, BE)")
    .option("--type <type>", "Number type: local or mobile", "local")
    .option("--sms", "Require SMS capability")
    .option("--mms", "Require MMS capability")
    .option("--voice", "Require voice capability")
    .option("--area-code <code>", "Filter by area code (digits only, US/CA)")
    .option("--limit <n>", "Maximum candidates to return (default 5, max 50)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus phone-number search --country US --sms --voice
  $ nexus phone-number search --country US --area-code 415 --limit 50
  $ nexus phone-number search --country GB --type mobile --json`
    )
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
        printTable(result as unknown as Record<string, unknown>[], [
          { key: "phoneNumber", label: "PHONE NUMBER", width: 20 },
          { key: "friendlyName", label: "FRIENDLY NAME", width: 25 },
          { key: "price", label: "PRICE", width: 10 },
          { key: "currency", label: "CURRENCY", width: 10 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── buy ─────────────────────────────────────────────────────────────
  phoneNumber
    .command("buy")
    .description("Purchase a phone number")
    .requiredOption("--phone-number <number>", "Phone number to buy (E.164 format)")
    .requiredOption("--country <code>", "ISO country code")
    .requiredOption("--price <price>", "Monthly price")
    .option("--connection-id <id>", "ApiKeyConnection ID for subaccount purchase")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus phone-number buy --phone-number +12025551234 --country US --price 1.15
  $ nexus phone-number buy --phone-number +442071234567 --country GB --price 1.00 --json`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.phoneNumbers.buy({
          phoneNumber: opts.phoneNumber,
          country: opts.country,
          price: opts.price,
          connectionId: opts.connectionId
        });
        printRecord(result as Record<string, unknown>, [
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

  // ── list ────────────────────────────────────────────────────────────
  addPaginationOptions(
    phoneNumber
      .command("list")
      .description("List your organization's phone numbers")
      .option("--search <query>", "Search by number or friendly name")
      .addHelpText(
        "after",
        `
Examples:
  $ nexus phone-number list
  $ nexus phone-number list --limit 50
  $ nexus phone-number list --search 415 --json

Notes:
  Results are paginated. Use --page/--limit. Check meta in --json output.`
      )
  ).action(async (opts) => {
    try {
      const client = createClient(program.optsWithGlobals());
      const { data, meta } = await client.phoneNumbers.list({
        ...getPaginationParams(opts),
        search: opts.search
      });

      printList(
        data as unknown as Record<string, unknown>[],
        meta as unknown as Record<string, unknown>,
        [
          { key: "id", label: "ID", width: 36 },
          { key: "number", label: "NUMBER", width: 18 },
          { key: "friendlyName", label: "NAME", width: 20 },
          { key: "countryCode", label: "COUNTRY", width: 10 },
          { key: "price", label: "PRICE", width: 10 },
          { key: "region", label: "REGION", width: 8 }
        ]
      );
    } catch (err) {
      process.exitCode = handleError(err);
    }
  });

  // ── get ─────────────────────────────────────────────────────────────
  phoneNumber
    .command("get")
    .description("Get phone number details")
    .argument("<id>", "Phone number ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus phone-number get abc-123
  $ nexus phone-number get abc-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.phoneNumbers.get(id);
        printRecord(result as Record<string, unknown>, [
          { key: "id", label: "ID" },
          { key: "number", label: "Number" },
          { key: "friendlyName", label: "Friendly Name" },
          { key: "countryCode", label: "Country" },
          { key: "price", label: "Price" },
          { key: "sid", label: "Twilio SID" },
          { key: "region", label: "Region" },
          { key: "createdAt", label: "Created" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── release ─────────────────────────────────────────────────────────
  phoneNumber
    .command("release")
    .description("Release a purchased phone number")
    .argument("<id>", "Phone number ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus phone-number release abc-123
  $ nexus phone-number release abc-123 --json`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        await client.phoneNumbers.release(id);
        printSuccess(`Phone number ${id} released successfully`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
