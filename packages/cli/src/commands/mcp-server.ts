import type { Command } from "commander";

import { MCP_OUTBOUND_DIRECTION } from "./mcp-direction";
import { registerMcpServerCallCommand } from "./mcp-server/call.command";
import { registerMcpServerGetCommand } from "./mcp-server/get.command";
import { registerMcpServerListCommand } from "./mcp-server/list.command";

/**
 * `nexus mcp-server …` — the MCP servers THIS ORGANIZATION connected, and one
 * call against one approved tool on one of them.
 *
 * ## 🔴 WHY THIS IS A SEPARATE NOUN AND NOT PART OF `nexus tool`
 *
 * `nexus tool get` renders `actions[]` keyed by `operationId`: a catalogued
 * Pipedream action, every one of which is callable. An MCP tool has a STATUS, an
 * approved schema hash and a standing drift report, and only one of its five
 * statuses may be called at all. Grafting the second onto the first noun gives one
 * command two renderings chosen by a type field — and this CLI derives each leaf's
 * `--json` shape from which printer its action reaches, so a branching printer
 * stops the command declaring its own output shape. The scope boundary is also
 * real: `mcp_servers:read` and `mcp_servers:execute` are not the tool scopes.
 *
 * ## 🔴 AND WHY IT IS NOT `nexus mcp`, WHICH IS ALREADY THE OPPOSITE DIRECTION
 *
 * `nexus mcp` is Nexus AS an MCP server. `commands/mcp-direction.ts` owns that
 * seam and both namespaces print its sentence, because the names differ by one
 * suffix and guessing wrong produces a complete-looking answer rather than an
 * error.
 *
 * ## `call` rather than `execute`, on purpose
 *
 * `tools/call` is the protocol's own verb, and the asymmetry with
 * `nexus tool execute` is what keeps the two out of each other's muscle memory.
 * They are not interchangeable: one dials a third-party server, the other runs a
 * catalogued integration action.
 *
 * ## One file per leaf
 *
 * Three verbs, three inputs, three printers, and nothing shared between them but
 * the client. The registration ORDER below is the published order — commander
 * emits `--help` in it and `content/docs/cli/commands/mcp-server.mdx` is generated
 * from the tree — so it is reads first, then the call.
 */
export function registerMcpServerCommands(program: Command): void {
  const mcpServer = program
    .command("mcp-server")
    .description("Read this organization's connected MCP servers and call an approved tool")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus mcp-server list
  $ nexus mcp-server get 11111111-1111-4111-8111-111111111111
  $ nexus mcp-server call 11111111-1111-4111-8111-111111111111 search_issues \\
      --arguments '{"query":"open"}'

Notes:${MCP_OUTBOUND_DIRECTION}
  ONLY AN APPROVED TOOL IS CALLABLE, AND "get" PUBLISHES ALL FIVE STATUSES. A tool
  in any other status is refused before anything is dialled, so read "get" before
  "call" rather than discovering it from the refusal.
  THE ORGANIZATION IS YOUR API KEY'S and is not a flag on any verb. An empty "list"
  means this organization has connected nothing — it is never a scoping failure.`
    );

  registerMcpServerListCommand(mcpServer, program); // the servers
  registerMcpServerGetCommand(mcpServer, program); //  one server and its tools
  registerMcpServerCallCommand(mcpServer, program); // dialling one approved tool
}
