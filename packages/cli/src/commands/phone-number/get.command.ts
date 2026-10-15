import type { Command } from "commander";

import { createClient } from "../../client";
import { handleError } from "../../errors";
import { printRecord } from "../../output";

/**
 * `nexus phone-number get`
 *
 * NOT bound to a contract — see the note beside the registration calls in
 * `commands/phone-number.ts`.
 */
export function registerPhoneNumberGetCommand(phoneNumber: Command, program: Command): void {
  phoneNumber
    .command("get")
    .description("Get phone number details")
    .argument("<id>", "Phone number ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus phone-number get 11111111-1111-4111-8111-111111111111
  $ nexus phone-number get 11111111-1111-4111-8111-111111111111 --json

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
}
