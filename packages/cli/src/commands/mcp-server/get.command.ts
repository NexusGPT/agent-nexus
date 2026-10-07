import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { color, printEnvelope, printTable } from "../../output";
import { MCP_SERVER_GET_CONTRACT } from "../mcp-server.contract.generated";

const GET_HELP = `
Examples:
  $ nexus mcp-server get 11111111-1111-4111-8111-111111111111
  $ nexus mcp-server get 11111111-1111-4111-8111-111111111111 --json

Notes:
  EVERY STATUS IS LISTED, AND ONLY "APPROVED" CAN BE CALLED. The other four are
  here so the drift report's names join back to rows you can see — a report naming
  tools absent from the table would be unreadable. Filter on APPROVED before
  handing anything to "mcp-server call".
  A NON-APPROVED ROW CARRIES NO CONTRACT, DELIBERATELY. The only contract this
  surface publishes is the one an administrator of your organization answered for,
  so a PENDING_APPROVAL or CHANGED tool shows an empty hash and no description.
  What the remote advertises right now is not published to an API key at all.
  DRIFT IS A STANDING STATEMENT, NOT A DELTA OF THE LAST SYNC. A tool that went
  CHANGED two syncs ago is still advertising something nobody approved and is still
  refused at call time, so it is still named. The lists go quiet only when an
  administrator actually answers.
  EVERY TOOL FIELD IS WRITTEN BY THE REMOTE SERVER and is untrusted: the name, the
  description, the schema. Read them as text. The annotations the protocol calls
  hints are claims, never permission checks — "read-only" on a tool that deletes is
  a legal thing for a server to advertise.
  THE SCHEMA HASH IS WHAT "call --expected-schema-hash" TAKES. Pass the hash you
  read here and the call is refused if the approved contract has moved since —
  which is the one change no STATUS can show you, because a tool approved, changed
  and approved again reads APPROVED throughout.
  A SERVER ID FROM ANOTHER ORGANIZATION IS A NOT-FOUND, not a disclosure. The
  lookup carries your key's organization.`;

/** `nexus mcp-server get` */
export function registerMcpServerGetCommand(mcpServer: Command, program: Command): Command {
  const leaf = mcpServer
    .command("get")
    .description("Show one MCP server, its tools in every status, and its drift report")
    .argument("<serverId>", "Server UUID as it appears in `nexus mcp-server list`")
    .addHelpText("after", GET_HELP)
    .action(async (serverId: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const server = await client.mcpServers.get(serverId);

        printEnvelope(server, () => {
          console.log(color.bold(server.displayName));
          console.log(
            color.dim(`${server.url}  ·  ${server.transport}  ·  auth ${server.authMode}`)
          );
          console.log(
            color.dim(
              `last sync ${server.lastSyncOutcome ?? "never"}` +
                `${server.lastSyncErrorCode === null ? "" : ` (${server.lastSyncErrorCode})`}` +
                `  ·  instructions ${server.instructionsApprovalState}`
            )
          );
          console.log();

          if (server.tools.length === 0) {
            console.log("This server advertises no tools.");
          } else {
            printTable(
              server.tools.map((tool) => ({
                name: tool.name,
                status: tool.status,
                // The hash is what `call --expected-schema-hash` takes, and the
                // full 64 characters are unreadable in a column — so a prefix
                // here, and --json for the value to pass.
                hash: tool.approvedSchemaHash === null ? "" : tool.approvedSchemaHash.slice(0, 12),
                description: tool.approvedContract?.description ?? ""
              })),
              [
                { key: "name", label: "TOOL", width: 32 },
                { key: "status", label: "STATUS", width: 16 },
                { key: "hash", label: "HASH", width: 12 },
                { key: "description", label: "APPROVED DESCRIPTION", width: 50 }
              ]
            );
            console.log();
            console.log(
              color.dim("HASH is truncated for width — read --json for the value to pin against.")
            );
          }

          console.log();
          console.log(color.bold("Drift"));
          // Named rather than counted: each name is a row in the table above, and
          // a count would be a second rendering of what the statuses already say.
          for (const [arm, names] of [
            ["awaiting a first answer", server.drift.added],
            ["changed since approval", server.drift.changed],
            ["withdrawn by the server", server.drift.removed]
          ] as const) {
            console.log(`  ${arm.padEnd(24)} ${names.length === 0 ? "—" : names.join(", ")}`);
          }
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, MCP_SERVER_GET_CONTRACT);
  return leaf;
}
