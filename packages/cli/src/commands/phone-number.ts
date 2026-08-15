import { Command } from "commander";

import { createClient } from "../client";
import { bindCommand, enumOption } from "../contract-binding";
import { handleError, refuse } from "../errors";
import { printList, printRecord, printSuccess, printTable } from "../output";
import { getPaginationParams } from "../util/pagination";
import {
  PHONE_NUMBER_SEARCH_AVAILABLE__PARAMS_TYPE,
  PHONE_NUMBER_SEARCH_AVAILABLE_CONTRACT
} from "./phone-number.contract.generated";

/**
 * Gate a command that SPENDS MONEY behind an explicit confirmation.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THESE TWO AND WHY THIS SHAPE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `buy` and `release` were the only mutating commands in this namespace with
 * neither a confirmation flag nor a warning, while `workspace delete`,
 * `deployment delete` and `whatsapp-template delete` — none of which move money
 * — all gate on `--yes`. They are also the only two here that cannot be undone:
 * a purchase bills monthly from the moment it returns, and a release hands the
 * number back to the carrier pool where it cannot be reclaimed.
 *
 * The shape is `workspace delete`'s, deliberately, including the part that
 * matters most: WITHOUT A TTY AND WITHOUT `--yes` THIS REFUSES rather than
 * proceeding. `deployment delete` takes the other branch — no TTY means no
 * prompt and the delete simply happens — which is survivable for a row and is
 * not survivable for a number a customer is receiving calls on.
 *
 * @returns true when the caller confirmed and the command should proceed.
 */
async function confirmIrreversible(yes: boolean | undefined, question: string): Promise<boolean> {
  if (yes) return true;

  if (!process.stdin.isTTY) {
    process.exitCode = refuse("use --yes to confirm in non-interactive mode");
    return false;
  }

  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // `finally`, not a bare close after the await: an interface left open holds
  // stdin and the process never exits. The sibling confirmations in this
  // package close on the happy path only, so a stdin error there hangs the CLI
  // instead of reporting the failure — not a shape to copy for a command whose
  // failure mode is "did my purchase go through?".
  let answer: string;
  try {
    answer = await rl.question(`${question} [y/N] `);
  } finally {
    rl.close();
  }

  if (answer.toLowerCase() !== "y") {
    console.log("Aborted.");
    return false;
  }
  return true;
}

export function registerPhoneNumberCommands(program: Command): void {
  const phoneNumber = program
    .command("phone-number")
    .description("Search, buy, and manage phone numbers for SMS/Voice deployments");

  phoneNumber.addHelpText(
    "after",
    `
TWO OF THESE COMMANDS MOVE MONEY AND NEITHER CAN BE UNDONE. "buy" starts a
monthly charge that runs until you release the number; "release" hands it back
to the carrier pool, where it cannot be reclaimed. Both refuse to run
non-interactively without --yes.

The usual order:
  1. nexus channel connection create   numbers are bought on a connection
  2. nexus phone-number search         look, costs nothing, reserves nothing
  3. nexus phone-number buy            THE PURCHASE
  4. nexus channel whatsapp-sender create   (WhatsApp only)
  5. nexus deployment create --type WHATSAPP | TWILIO_SMS | TWILIO_VOICE

A number must be ACTIVE to be bound to a deployment. Reads need
phone_numbers:read, buy needs phone_numbers:write, release needs
phone_numbers:delete — and release additionally needs a key that identifies a
user, or it is a 401.`
  );

  // ── search ──────────────────────────────────────────────────────────
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
    .addHelpText(
      "after",
      `
Examples:
  $ nexus phone-number search --country US --sms --voice
  $ nexus phone-number search --country US --area-code 415 --limit 50
  $ nexus phone-number search --country GB --type mobile --json

Notes:
  SEARCHING RESERVES NOTHING AND COSTS NOTHING. A candidate can be gone by the
  time you buy it — that is a 409, and re-running the search is the fix.
  Ask for the capabilities you need HERE. --sms, --mms and --voice all default
  to false, so a bare search returns numbers that may do none of them, and
  nothing later checks that the number you bought can carry the channel you
  deployed it on. WhatsApp and SMS need --sms; a voice deployment needs
  --voice.
  PRICE is the monthly rate and is what "phone-number buy --price" must
  repeat. Copy it from this table rather than typing it.
  --area-code is digits only and Twilio applies it to US and Canada only.
  --limit is capped at 50 and defaults to 5. Over the cap is a 400, NOT a clamp
  to 50 — the search does not run at all.
  THIS STEP NEEDS NO CONNECTION. The order above starts at "channel connection
  create" because BUYING needs one; searching does not, and returns live carrier
  inventory on an organization with no messaging connection at all. So an empty
  result here means no matching numbers, never a missing prerequisite — and you
  can price a country before setting anything up.

  --json HERE IS A BARE ARRAY, not {data,meta}. "phone-number list" is the
  other shape, so a jq '.data[]' carried over from it selects nothing AND DOES
  NOT ERROR — the miss reads as "no numbers available". Use jq '.[]'.`
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

  // ── buy ─────────────────────────────────────────────────────────────
  phoneNumber
    .command("buy")
    .description("Purchase a phone number — THIS SPENDS MONEY and bills monthly")
    .requiredOption("--phone-number <number>", "Phone number to buy (E.164 format)")
    .requiredOption("--country <code>", "ISO country code")
    .requiredOption(
      "--price <price>",
      "Monthly price from the search result — THIS IS THE AMOUNT DEBITED"
    )
    .option("--connection-id <id>", "ApiKeyConnection ID for subaccount purchase")
    .option("--yes", "Skip the confirmation — required when not on a terminal")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus phone-number buy --phone-number +12025551234 --country US --price 1.15
  $ nexus phone-number buy --phone-number +442071234567 --country GB --price 1.00 --yes

Notes:
  THIS IS A PURCHASE. It bills your account monthly until you run
  "nexus phone-number release <id>", and nothing expires it. It is confirmed
  once here and never again — there is no cancel, no undo and no refund.

  IN A SCRIPT, WITHOUT --yes, IT BUYS NOTHING AND EXITS 1. There is no prompt to
  answer when stdin is not a terminal, so the command refuses rather than
  proceeding: you get "use --yes to confirm in non-interactive mode" and no
  number. A pipeline that ignores the exit code carries on as though it had
  bought one. This is the OPPOSITE of the delete commands elsewhere in this CLI,
  which act unprompted in a script — do not carry that habit here, and do not
  reach for --yes until you have read the --price note below.

  THE GATE READS STDIN, NOT STDOUT. Redirecting output alone still prompts;
  it is a piped or absent stdin that triggers the refusal.

  --price IS THE AMOUNT CHARGED, NOT A CHECK. Whatever you pass is what gets
  debited from the organization's balance; it is never compared against what
  the carrier actually charges. A typo here bills the typo. Copy the PRICE
  column from "nexus phone-number search" verbatim, as a plain decimal string.

  Buy the capabilities you need. The purchase does not verify that the number
  can carry the channel you intend — a voice-only number attaches to a
  WhatsApp deployment and simply never delivers. Filter at search time with
  --sms / --voice.
  --connection-id charges the customer's own Twilio subaccount instead of the
  Nexus pool, and pins the number to that connection for webhooks and for the
  eventual release. Omit it for a normal purchase.
  Re-buying a number this organization already holds as ACTIVE returns the
  existing row and does not charge again.
  Verify with "nexus phone-number list" — the number appears there once ACTIVE.`
    )
    .action(async (opts) => {
      try {
        if (
          !(await confirmIrreversible(
            opts.yes,
            `Buy ${opts.phoneNumber} for ${opts.price}/month? This bills until released.`
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

  // ── list ────────────────────────────────────────────────────────────
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
  --limit above 100 is a 400, not a clamp. Page with meta.hasMore in --json.`
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
  $ nexus phone-number get abc-123 --json

Notes:
  A RELEASED NUMBER IS A 404 HERE, not a record with a released status. This
  read is scoped to ACTIVE, so "not found" covers released, deleted, another
  organization's, never-existed, and an organization that has never bought a
  number at all — all alike. A 404 is therefore not evidence of a permissions
  problem. Check "nexus phone-number list" first: an empty list with total 0
  says the organization owns nothing, which is the usual explanation.
  <id> is the Nexus UUID from "phone-number list", not the phone number and
  not the Twilio SID.`
    )
    .action(async (id: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.phoneNumbers.get(id);
        printRecord(result, [
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
    .description("Give a number back to the carrier — PERMANENT, and it silences its channels")
    .argument("<id>", "Phone number ID")
    .option("--yes", "Skip the confirmation — required when not on a terminal")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus phone-number release abc-123
  $ nexus phone-number release abc-123 --yes

Notes:
  THE NUMBER GOES BACK TO THE CARRIER POOL AND CANNOT BE RECLAIMED. Somebody
  else can buy it minutes later. Anyone who has it saved, or a customer
  mid-conversation, reaches a stranger or nothing at all.

  EVERY DEPLOYMENT ON THIS NUMBER IS DETACHED AND STOPS RECEIVING, AND NOTHING
  ERRORS. Their phoneNumberId is nulled, every WhatsApp sender registered on
  the number is deregistered and deleted, and the deployments stay listed and
  look healthy while receiving nothing. List them first:
  "nexus deployment list --type WHATSAPP --json" and check phoneNumberId.

  Billing stops when the release reaches the carrier. If that call fails the
  number is still released in Nexus and an operator issue is filed — the
  response's twilioReleased: false is the only sign, and until an operator
  clears it the carrier may keep charging.
  The response counts what it took with it: detachedDeployments and
  removedWhatsappSenders.
  Releasing an already-released number is a 409, not a silent success. A key
  that identifies no user is a 401 — the release is recorded against a person.
  Needs phone_numbers:delete, which phone_numbers:write does not imply.

  IN A SCRIPT, WITHOUT --yes, IT RELEASES NOTHING AND EXITS 1. Non-interactive
  stdin gets "use --yes to confirm in non-interactive mode" instead of a prompt,
  so a cleanup job that never checks the exit code leaves every number in place
  and still bills. The gate reads STDIN — redirecting output alone still
  prompts. Note this is the opposite of the delete commands elsewhere in this
  CLI, which act unprompted in a script.`
    )
    .action(async (id: string, opts) => {
      try {
        if (
          !(await confirmIrreversible(
            opts.yes,
            `Release phone number ${id}? It cannot be reclaimed and its deployments stop receiving.`
          ))
        ) {
          return;
        }

        const client = createClient(program.optsWithGlobals());
        await client.phoneNumbers.release(id);
        printSuccess(`Phone number ${id} released successfully`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(search, PHONE_NUMBER_SEARCH_AVAILABLE_CONTRACT);
}
