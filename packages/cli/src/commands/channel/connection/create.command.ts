import type { Command } from "commander";

import { createClient } from "../../../client";
import { bindCommand, enumOption } from "../../../contract-binding";
import { handleError } from "../../../errors";
import { printRecord, printSuccess } from "../../../output";
import {
  CHANNEL_CONNECTION_CREATE__BODY_REGION,
  CHANNEL_CONNECTION_CREATE_CONTRACT
} from "../../channel.contract.generated";

/** `nexus channel connection create` */
export function registerChannelConnectionCreateCommand(
  connection: Command,
  program: Command
): void {
  const connectionCreate = connection
    .command("create")
    .description("Create a messaging connection (max 1 per organization)")
    .addOption(
      enumOption("--region <region>", "Region", CHANNEL_CONNECTION_CREATE__BODY_REGION).default(
        "us1"
      )
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel connection create
  $ nexus channel connection create --region ie1

Notes:
  THE REGION IS PERMANENT AND THERE IS ONLY ONE CONNECTION PER ORGANIZATION.
  Nothing here changes it afterwards and a second create is a 409
  LIMIT_REACHED, so choosing us1 by accident means every WhatsApp, SMS and
  Voice number this organization ever buys lives in us1. Pick ie1 deliberately
  if the data has to stay in Europe.
  Not idempotent in the useful direction: run "connection list" first rather
  than relying on the 409.
  Only us1 and ie1 are accepted; anything else is a 400.
  This is the FIRST step for WhatsApp, SMS and Voice — the number purchase and
  the WhatsApp sender both hang off this connection.`
    )
    .action(async (opts) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.createConnection({ region: opts.region });
        const data = result;
        printRecord(data, [
          { key: "id", label: "ID" },
          { key: "name", label: "Name" },
          { key: "accountSid", label: "Account SID" },
          { key: "region", label: "Region" },
          { key: "status", label: "Status" }
        ]);
        printSuccess("Messaging connection created.");
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists.
  bindCommand(connectionCreate, CHANNEL_CONNECTION_CREATE_CONTRACT);
}
