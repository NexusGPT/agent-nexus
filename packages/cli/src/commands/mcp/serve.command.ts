import type { Command } from "commander";

import { handleError } from "../../errors";
import {
  createBridgeForwarder,
  createMcpTransport,
  MCP_DEFAULT_TIMEOUT_SECONDS
} from "../../util/mcp-rpc";
import { runStdioBridge } from "../../util/mcp-stdio";

/** `nexus mcp serve` */
export function registerMcpServeCommand(mcp: Command, program: Command): void {
  mcp
    .command("serve")
    .description("Run the stdio MCP bridge on the active CLI profile")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus mcp serve
  $ nexus mcp serve --profile prod
  $ nexus mcp serve --timeout 120

Notes:
  THIS IS NOT AN INTERACTIVE COMMAND. It reads newline-delimited JSON-RPC on
  STDIN and writes replies on STDOUT until stdin closes, which is what an MCP
  host does to it. Run from a terminal it will simply sit there — use
  "nexus mcp tools list" to check the surface by hand, and "nexus mcp install" to
  wire it into a host.
  STDOUT IS THE PROTOCOL. Nothing else is ever written there; the profile banner,
  warnings and errors all go to stderr, so a host's transport stays parseable.
  ONE STDERR LINE ON STARTUP NAMES THE ENDPOINT, THE PROFILE AND THE ORGANIZATION
  this bridge is bound to. Read it in the host's MCP log when a tool answers from
  a tenant you did not expect — it is the only place that pairing is stated.
  IT CARRIES NO CREDENTIALS OF ITS OWN. The profile is resolved once, at start,
  through the same chain as every other command — so pin it with --profile in the
  host config rather than relying on the ACTIVE profile, which "nexus auth switch"
  in any other terminal repoints for every process on the machine. A running
  bridge does NOT pick that change up; restart the host if you meant it to.
  THE TOOL SET IS THE SERVER'S. This process forwards messages and never invents,
  filters or renames a tool, so what a host sees is exactly what
  "nexus mcp tools list" prints for the same profile.
  THE GLOBAL --timeout APPLIES PER MESSAGE and defaults to ${MCP_DEFAULT_TIMEOUT_SECONDS}s here. A tool
  call that outlives it is reported to the host as a JSON-RPC error; the
  underlying API request may still be completing.`
    )
    .action(async () => {
      try {
        const transport = createMcpTransport(program.optsWithGlobals());
        const { url, profileName, profileSource, organizationId, keyIsCrossOrg } = transport.target;

        // ON STDERR, ALWAYS, AND IT IS THE ONE PLACE THIS PAIRING IS STATED. A
        // host shows the tool NAMES and nothing about which tenant answers them,
        // so "the agent listed somebody else's agents" has no other diagnostic.
        // Never stdout: that belongs to the protocol.
        process.stderr.write(
          `nexus mcp serve: ${url} · profile ${profileName} (${profileSource}) · ` +
            `org ${organizationId ?? (keyIsCrossOrg ? "(NONE SELECTED — the server picks the tenant)" : "(the key's own)")}\n`
        );

        await runStdioBridge({
          input: process.stdin,
          write: (line) => process.stdout.write(line + "\n"),
          warn: (message) => process.stderr.write(`nexus mcp serve: ${message}\n`),
          forward: createBridgeForwarder(transport)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
}
