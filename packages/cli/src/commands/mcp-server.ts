import type { Command } from "commander";

import { MCP_OUTBOUND_DIRECTION } from "./mcp-direction";
import { registerMcpServerCallCommand } from "./mcp-server/call.command";
import { registerMcpServerGetCommand } from "./mcp-server/get.command";
import { registerMcpServerListCommand } from "./mcp-server/list.command";
import { registerMcpServerSyncCommand } from "./mcp-server/sync.command";

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
 * ## `sync` ASKS, and that is why it is not spelled `refresh` or `discover`
 *
 * The verb returns when the REQUEST is recorded, not when the discovery has run — the
 * backend enqueues it, because dialling a stranger's server and walking its tool list
 * is bounded in minutes and no client deadline covers that. So the name had to be one
 * that does not promise a finished result, and `sync` is the word the dashboard button
 * already uses for the same act. `mcp-server get` is what answers what it found.
 *
 * It also carries its own scope. `mcp_servers:write` is neither of the other two: a
 * discovery REPLACES the tool list, so it can withdraw a tool an agent is pinned to and
 * can make new ones callable where the organization's auto-approval policy allows.
 *
 * ## One file per leaf
 *
 * Four verbs, four inputs, four printers, and nothing shared between them but the
 * client. The registration ORDER below is the published order — commander emits
 * `--help` in it and `content/docs/cli/commands/mcp-server.mdx` is generated from the
 * tree — so it reads as a sequence an operator actually performs: see what is
 * connected, read one, refresh it, then dial a tool on it.
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
  $ nexus mcp-server sync 11111111-1111-4111-8111-111111111111
  $ nexus mcp-server call 11111111-1111-4111-8111-111111111111 search_issues \\
      --arguments '{"query":"open"}'

Notes:${MCP_OUTBOUND_DIRECTION}
  ONLY AN APPROVED TOOL IS CALLABLE, AND "get" PUBLISHES ALL FIVE STATUSES. A tool
  in any other status is refused before anything is dialled, so read "get" before
  "call" rather than discovering it from the refusal.
  "sync" ASKS FOR A DISCOVERY AND DOES NOT WAIT FOR ONE. It records the request and
  returns; the tool list it prints is still the previous discovery's. Run "get" a
  little later for what the new one found.
  THE ORGANIZATION IS YOUR API KEY'S and is not a flag on any verb. An empty "list"
  means this organization has connected nothing — it is never a scoping failure.`
    );

  registerMcpServerListCommand(mcpServer, program); // the servers
  registerMcpServerGetCommand(mcpServer, program); //  one server and its tools
  registerMcpServerSyncCommand(mcpServer, program); // asking for a re-discovery
  registerMcpServerCallCommand(mcpServer, program); // dialling one approved tool
}
