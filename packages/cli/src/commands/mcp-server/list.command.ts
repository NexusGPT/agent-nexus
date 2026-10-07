import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand } from "../../contract-binding";
import { handleError } from "../../errors";
import { color, printEnvelope, printTable } from "../../output";
import { MCP_SERVER_LIST_CONTRACT } from "../mcp-server.contract.generated";

const LIST_HELP = `
Examples:
  $ nexus mcp-server list
  $ nexus mcp-server list --json

Notes:
  AN EMPTY LIST IS THE ORDINARY ANSWER and exits 0. It means this organization has
  registered no MCP server — never that a read was refused and never a scoping
  failure, because the read is anchored on your API key's organization.
  THIS IS NOT PAGINATED. The contract declares no cursor: an organization's
  registered servers are a set an administrator maintains by hand, not a table.
  THE TOOL COUNTS ARE THE WHOLE POINT OF THIS VIEW. Only APPROVED tools are
  callable, so "approved 0" on a server whose sync SUCCEEDED means an
  administrator has not answered for anything on it yet — the server is reachable
  and nothing on it can be called. Run "mcp-server get <serverId>" for the names.
  DISPLAY NAME IS YOURS, URL IS YOURS. Both were typed by whoever registered the
  server, so neither is text a remote chose. Everything "get" prints about a TOOL
  is the remote's own text.
  LAST SYNC IS THE TOOL LIST'S FRESHNESS, NOT A LIVENESS CHECK. "QUEUED" means a
  sync was asked for and has not answered, so the counts beside it are whatever
  the previous one left. A FAILED sync carries a code naming a CLASS of failure
  and never the remote's own error text, which can echo a credential.`;

/** `nexus mcp-server list` */
export function registerMcpServerListCommand(mcpServer: Command, program: Command): Command {
  const leaf = mcpServer
    .command("list")
    .description("List the MCP servers this organization has registered")
    .addHelpText("after", LIST_HELP)
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.mcpServers.list();

        printEnvelope(result, () => {
          if (result.servers.length === 0) {
            console.log("No MCP servers are registered for this organization.");
            console.log(
              color.dim(
                "An administrator registers one in the dashboard; this CLI reads them and calls approved tools."
              )
            );
            return;
          }

          printTable(
            result.servers.map((server) => ({
              serverId: server.serverId,
              displayName: server.displayName,
              approved: server.toolCounts.approved,
              pending: server.toolCounts.pendingApproval,
              drifted: server.toolCounts.changed + server.toolCounts.removed,
              lastSync: server.lastSyncOutcome ?? "never",
              // The code and not the outcome, because a FAILED row's whole
              // diagnostic is which class of failure it was.
              errorCode: server.lastSyncErrorCode ?? ""
            })),
            [
              { key: "serverId", label: "SERVER ID", width: 36 },
              { key: "displayName", label: "NAME", width: 24 },
              { key: "approved", label: "APPROVED", width: 8 },
              { key: "pending", label: "PENDING", width: 7 },
              { key: "drifted", label: "DRIFTED", width: 7 },
              { key: "lastSync", label: "LAST SYNC", width: 10 },
              { key: "errorCode", label: "ERROR", width: 28 }
            ]
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
  bindCommand(leaf, MCP_SERVER_LIST_CONTRACT);
  return leaf;
}
