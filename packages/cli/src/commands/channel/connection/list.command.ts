import type { Command } from "commander";

import { createClient } from "../../../client";
import { handleError } from "../../../errors";
import { printTable } from "../../../output";

/** `nexus channel connection list` */
export function registerChannelConnectionListCommand(connection: Command, program: Command): void {
  connection
    .command("list")
    .description("List messaging connections")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus channel connection list
  $ nexus channel connection list --json

Notes:
  An organization has at most one, so this is a zero- or one-row table. Its ID
  is the --connection-id every WhatsApp command below wants.
  Credentials are redacted server-side and never appear here.
  STATUS describes the Twilio account, not WhatsApp. Whether Meta is linked
  shows up as a wabaId on the connection — read it with --json, or use
  "nexus channel setup --type WHATSAPP".

  --json HERE IS A BARE ARRAY, not {data,meta}. jq '.data[]' selects nothing
  and does not error, so the miss reads as "no connection". Use jq '.[]'.`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.channels.listConnections();
        const data = result;
        printTable(Array.isArray(data) ? data : [data], [
          { key: "id", label: "ID", width: 38 },
          { key: "name", label: "NAME", width: 20 },
          { key: "region", label: "REGION", width: 8 },
          { key: "status", label: "STATUS", width: 12 }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
