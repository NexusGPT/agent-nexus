import { Command } from "commander";

import { registerMcpCallCommand } from "./mcp/call.command";
import { registerMcpInstallCommand } from "./mcp/install.command";
import { registerMcpServeCommand } from "./mcp/serve.command";
import { registerMcpToolsCommands } from "./mcp/tools/tools.commands";
import { MCP_INBOUND_DIRECTION } from "./mcp-direction";

/**
 * `nexus mcp` — THE OUTBOUND MCP SURFACE, FROM THE CLI THAT ALREADY HOLDS THE KEY.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT WAS WRONG (NEX-3022)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `POST /api/public/v1/mcp` has worked for a long time and was invisible from
 * here: no `mcp` command, nothing in `nexus docs`, and the only typed way in was
 * `nexus api POST /mcp` with a hand-written JSON-RPC envelope. Anyone who found
 * the surface at all found it as a separate npm package, `@agent-nexus/mcp-server`,
 * whose `nexus-mcp login` asks for a key the CLI is already holding.
 *
 * The cost is not only ergonomic. That bridge resolves a credential its own way
 * — `NEXUS_API_KEY`, else the ACTIVE profile — which is a strict SUBSET of this
 * CLI's resolution, and the missing part changes which tenant a call lands in:
 * it sends no `organization-id` header, so a cross-org personal token drives MCP
 * against whatever organization the server defaults to while every other command
 * in the same shell acts on the one `nexus auth use-org` selected. See
 * `util/mcp-rpc.ts`, which is the one place this namespace resolves any of it.
 *
 * ── WHAT EACH VERB IS FOR ────────────────────────────────────────────────────
 *
 *   tools list / tools get   read the catalog the CALLING KEY can see
 *   call                     invoke one tool, once, and print what it returned
 *   serve                    be the stdio bridge, on the active CLI profile
 *   install                  emit or apply the host config block for `serve`
 *
 * `serve` is what removes the second credential store: an MCP host configured by
 * `install` launches this binary, so the key it uses is the profile's, resolved
 * by the same chain `--profile`, `NEXUS_PROFILE` and `.nexusrc` already drive.
 */
export function registerMcpCommands(program: Command): void {
  const mcp = program
    .command("mcp")
    .description("Inspect, call, and serve the Nexus MCP tool surface")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus mcp tools list
  $ nexus mcp tools list --filter agent
  $ nexus mcp tools get agent_list
  $ nexus mcp call agent_list --input '{"query":{"limit":5}}'
  $ nexus mcp install --client claude-code
  $ nexus mcp serve

Notes:${MCP_INBOUND_DIRECTION}
  ONE ENDPOINT SITS BEHIND ALL OF THIS: POST {base-url}/api/public/v1/mcp,
  speaking JSON-RPC 2.0. Every verb here is a typed way to send it a message, so
  --profile, --api-key, --base-url and --timeout mean exactly what they mean
  everywhere else in this CLI.
  THE TOOL CATALOG IS GENERATED SERVER-SIDE AND FILTERED BY YOUR KEY'S SCOPES.
  It is the intersection of the live Public API v1 routes and the ones opted in
  to MCP, narrowed to what the calling key may do — so a tool MISSING from
  "tools list" usually means a missing scope, not a missing feature. Run
  "nexus permissions access" to see what the key actually holds.
  THERE IS NO SECOND LOGIN AND NO SECOND CREDENTIAL FILE. "mcp serve" runs on
  the profile this CLI already resolved, so an MCP host configured by
  "mcp install" reaches exactly the organization "nexus auth status" names.`
    );

  registerMcpToolsCommands(mcp, program);
  registerMcpCallCommand(mcp, program);
  registerMcpServeCommand(mcp, program);
  registerMcpInstallCommand(mcp, program);
}
